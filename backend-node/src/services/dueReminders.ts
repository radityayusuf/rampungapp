import crypto from 'crypto';
import { prisma } from '../db';
import { broadcastSync } from '../socket';
import { atLeast } from './plans';
import { planOf } from './workspacePlan';

const TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Jakarta';
/** Pengingat dikirim mulai jam ini (waktu setempat), bukan tengah malam. */
const START_HOUR = 7;
/** Penanda "sudah dijalankan": koleksi internal yang tidak pernah dikirim ke klien. */
const RUNS = 'automationRuns';

type Json = Record<string, any>;

const parse = (s: string): Json | null => {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
};

/** Tanggal (YYYY-MM-DD) dan jam di zona waktu aplikasi; server produksi sendiri berjalan di UTC. */
function localNow(now: Date): { date: string; hour: number } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

const runId = (rule: string, task: string, due: string) => crypto.createHash('sha256').update(`${rule}|${task}|${due}`).digest('hex').slice(0, 40);

/**
 * Menjalankan aturan otomasi "Tenggat besok": setiap pasangan aturan–tugas–tenggat hanya sekali.
 * Aksi lewat WhatsApp tidak dijalankan di sini (integrasinya belum aktif).
 * Mengembalikan jumlah aksi yang dijalankan.
 */
export async function runDueReminders(now = new Date()): Promise<number> {
  const local = localNow(now);
  if (local.hour < START_HOUR) return 0;
  const tomorrow = new Date(`${local.date}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const due = tomorrow.toISOString().slice(0, 10);

  const ruleRows = await prisma.records.findMany({ where: { collection: 'automations', data: { contains: 'due_soon' } }, select: { workspace_id: true, data: true } });
  const byWorkspace = new Map<bigint, Json[]>();
  for (const r of ruleRows) {
    const rule = parse(r.data);
    if (!rule || rule.trigger !== 'due_soon' || !rule.isActive) continue;
    if (rule.action !== 'notify_assignee' && rule.action !== 'set_priority_high') continue;
    byWorkspace.set(r.workspace_id, [...(byWorkspace.get(r.workspace_id) ?? []), rule]);
  }

  let total = 0;
  for (const [wsId, rules] of byWorkspace) {
    try {
      if (!atLeast((await planOf(wsId)).plan, 'pro')) continue; // otomasi mulai paket Pro
      total += await runWorkspace(wsId, rules, due, now);
    } catch (e) {
      console.error(`[PENGINGAT] workspace ${wsId} gagal:`, e);
    }
  }
  return total;
}

async function runWorkspace(wsId: bigint, rules: Json[], due: string, now: Date): Promise<number> {
  const candidates = async (db: Pick<typeof prisma, 'records'>) => {
    const rows = await db.records.findMany({ where: { workspace_id: wsId, collection: 'tasks', data: { contains: due } }, select: { rid: true, data: true } });
    const tasks = rows.map((r) => ({ rid: r.rid, task: parse(r.data) })).filter((x): x is { rid: string; task: Json } => !!x.task && x.task.dueDate === due && x.task.status !== 'done');
    const pairs = tasks.flatMap((t) => rules.map((rule) => ({ ...t, rule, run: runId(String(rule.id), t.rid, due) })));
    if (!pairs.length) return [];
    const ran = new Set((await db.records.findMany({ where: { workspace_id: wsId, collection: RUNS, rid: { in: pairs.map((p) => p.run) } }, select: { rid: true } })).map((r) => r.rid));
    return pairs.filter((p) => !ran.has(p.run));
  };
  if (!(await candidates(prisma)).length) return 0;

  const done = await prisma.$transaction(async (tx) => {
    // Mengunci workspace seperti push sinkronisasi, lalu dibaca ulang agar tidak menimpa perubahan yang sedang disimpan.
    const ws = await tx.workspaces.update({ where: { id: wsId }, data: { rev: { increment: 1 } } });
    const todo = await candidates(tx);
    const runs = new Map<string, number>();
    const tasks = new Map<string, Json>();
    for (const p of todo) {
      await tx.records.create({ data: { workspace_id: wsId, collection: RUNS, rid: p.run, data: '{}', created_at: now, updated_at: now } });
      const task = tasks.get(p.rid) ?? p.task;
      if (p.rule.action === 'set_priority_high') {
        tasks.set(p.rid, { ...task, priority: 'high', updatedAt: now.toISOString() });
      } else {
        if (typeof task.assigneeId !== 'string' || !task.assigneeId) continue;
        const id = `n-due-${p.run}`;
        const n = { id, userId: task.assigneeId, actorId: 'system', kind: 'due', text: `mengingatkan: "${task.title}" jatuh tempo besok`, taskId: p.rid, read: false, createdAt: now.toISOString() };
        await tx.records.create({ data: { workspace_id: wsId, collection: 'notifications', rid: id, data: JSON.stringify(n), created_at: now, updated_at: now } });
      }
      runs.set(String(p.rule.id), (runs.get(String(p.rule.id)) ?? 0) + 1);
    }
    for (const [rid, task] of tasks) {
      await tx.records.updateMany({ where: { workspace_id: wsId, collection: 'tasks', rid }, data: { data: JSON.stringify(task), updated_at: now } });
    }
    for (const [rid, n] of runs) {
      const row = await tx.records.findFirst({ where: { workspace_id: wsId, collection: 'automations', rid } });
      const rule = row && parse(row.data);
      if (row && rule) await tx.records.update({ where: { id: row.id }, data: { data: JSON.stringify({ ...rule, runCount: (Number(rule.runCount) || 0) + n }), updated_at: now } });
    }
    return { count: [...runs.values()].reduce((a, b) => a + b, 0), rev: Number(ws.rev) };
  }, { timeout: 30_000 });

  broadcastSync(Number(wsId), { rev: done.rev, senderId: 0, applied: done.count });
  return done.count;
}

/** Periksa berkala. Penanda lebih dari 30 hari dibersihkan. */
export function startDueReminders(everyMs = 15 * 60_000): void {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const n = await runDueReminders();
      if (n) console.log(`[PENGINGAT] ${n} aksi "Tenggat besok" dijalankan.`);
      await prisma.records.deleteMany({ where: { collection: RUNS, created_at: { lt: new Date(Date.now() - 30 * 864e5) } } });
    } catch (e) {
      console.error('[PENGINGAT] gagal:', e);
    } finally {
      busy = false;
    }
  };
  setTimeout(tick, 15_000);
  setInterval(tick, everyMs);
}
