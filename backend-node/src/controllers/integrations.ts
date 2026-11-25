import crypto from 'crypto';
import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../db';
import { isStr } from '../validation';
import { AiError, aiModel, breakdownFromTemplate, breakdownWithAi, isAiConfigured } from '../services/ai';
import { getPaymentSettings, isPaymentConfigured } from '../services/paymentSettings';
import { requirePlan } from '../services/workspacePlan';
import { WhatsAppError, getAccountInfo, isWhatsAppConfigured, normalizePhone, sendText } from '../services/whatsapp';
import { validateWebhook } from '../services/webhookGuard';

const isAdmin = (u: AuthRequest['user']) => !!u && (u.role === 'owner' || u.role === 'admin' || u.role === 'superadmin');
const denyAdmin = (res: Response) => res.status(403).json({ message: 'Hanya pemilik atau admin yang boleh melakukan ini.' });
const notConfigured = (res: Response, what: string, hint: string) =>
  res.status(503).json({ configured: false, message: `${what} belum dikonfigurasi di server. ${hint}` });

// ─── Status integrasi (jujur: apa yang benar-benar aktif) ───

export async function getStatus(req: AuthRequest, res: Response): Promise<void> {
  const wsId = req.user?.workspace_id;
  if (!wsId) {
    res.status(401).json({ message: 'Sesi tidak valid.' });
    return;
  }

  const wa = isWhatsAppConfigured() ? await getAccountInfo() : null;
  const storage = await prisma.uploads.aggregate({ where: { workspace_id: wsId }, _sum: { size: true }, _count: { id: true } });

  res.json({
    payments: { configured: isPaymentConfigured(await getPaymentSettings()), method: 'manual' },
    whatsapp: {
      configured: isWhatsAppConfigured(),
      reachable: isWhatsAppConfigured() ? wa !== null : null,
      phoneNumber: wa?.phoneNumber ?? null,
      accountName: wa?.accountName ?? null,
    },
    ai: { configured: isAiConfigured(), model: isAiConfigured() ? aiModel() : null },
    webhook: { services: ['slack', 'discord'] },
    email: { configured: !!process.env.SMTP_HOST },
    google: { configured: !!process.env.GOOGLE_CLIENT_ID },
    storage: { usedBytes: Number(storage._sum.size ?? 0), files: storage._count.id },
  });
}

// ─── WhatsApp (Meta Cloud API) ───

export async function sendWhatsApp(req: AuthRequest, res: Response): Promise<void> {
  if (!isAdmin(req.user)) return void denyAdmin(res);
  if (!(await requirePlan(res, req.user!.workspace_id!, 'bisnis', 'Integrasi WhatsApp'))) return;
  if (!isWhatsAppConfigured()) {
    return void notConfigured(res, 'WhatsApp', 'Isi WHATSAPP_TOKEN dan WHATSAPP_PHONE_NUMBER_ID (WhatsApp Business Cloud API) di backend.');
  }

  const to = normalizePhone(req.body?.phone);
  const message = req.body?.message;
  if (!to) {
    res.status(422).json({ message: 'Nomor WhatsApp tidak valid.' });
    return;
  }
  if (!isStr(message) || message.trim().length === 0 || message.length > 1000) {
    res.status(422).json({ message: 'Pesan wajib diisi (maksimal 1000 karakter).' });
    return;
  }

  try {
    const { messageId } = await sendText(to, message.trim());
    // "accepted": diterima Meta untuk dikirim. Status baca/terkirim ke penerima tidak diklaim di sini.
    res.json({ status: 'accepted', messageId, to: `+${to}`, sentAt: new Date().toISOString(), message: 'Pesan diterima WhatsApp untuk dikirim.' });
  } catch (e) {
    if (e instanceof WhatsAppError) return void res.status(e.status).json({ message: e.message });
    throw e;
  }
}

// ─── Asisten AI ───

export async function aiBreakdownTask(req: AuthRequest, res: Response): Promise<void> {
  const title = req.body?.title;
  const description = req.body?.description;
  if (!isStr(title) || title.trim().length === 0 || title.length > 200) {
    res.status(422).json({ message: 'Judul tugas diperlukan (maksimal 200 karakter).' });
    return;
  }
  if (description !== undefined && (!isStr(description) || description.length > 2000)) {
    res.status(422).json({ message: 'Deskripsi maksimal 2000 karakter.' });
    return;
  }

  if (!(await requirePlan(res, req.user!.workspace_id!, 'bisnis', 'Asisten AI'))) return;
  if (!isAiConfigured()) {
    res.json(breakdownFromTemplate(title.trim())); // bertanda source: 'template'
    return;
  }
  try {
    res.json(await breakdownWithAi(title.trim(), (description ?? '').trim()));
  } catch (e) {
    if (e instanceof AiError) return void res.status(e.status).json({ message: e.message });
    throw e;
  }
}

/** Ringkasan proyek dihitung dari data workspace di server, bukan dari data kiriman klien. */
export async function aiSummarizeProject(req: AuthRequest, res: Response): Promise<void> {
  const wsId = req.user?.workspace_id;
  if (!wsId) {
    res.status(401).json({ message: 'Sesi tidak valid.' });
    return;
  }
  const projectId = req.body?.projectId;
  if (!isStr(projectId) || projectId.length === 0 || projectId.length > 100) {
    res.status(422).json({ message: 'ID proyek diperlukan.' });
    return;
  }

  const projRec = await prisma.records.findUnique({ where: { workspace_id_collection_rid: { workspace_id: wsId, collection: 'projects', rid: projectId } } });
  if (!projRec) {
    res.status(404).json({ message: 'Proyek tidak ditemukan.' });
    return;
  }
  const project = JSON.parse(projRec.data) as Record<string, any>;

  const rows = await prisma.records.findMany({ where: { workspace_id: wsId, collection: 'tasks' } });
  const tasks: Record<string, any>[] = [];
  for (const r of rows) {
    try {
      const t = JSON.parse(r.data);
      if (t.projectId === projectId) tasks.push(t);
    } catch {
      // abaikan catatan rusak
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const total = tasks.length;
  const count = (s: string) => tasks.filter((t) => t.status === s).length;
  const done = count('done');
  const overdue = tasks.filter((t) => t.status !== 'done' && typeof t.dueDate === 'string' && t.dueDate < today);
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

  // Rencana ideal: persentase waktu proyek yang sudah berlalu.
  let expected: number | null = null;
  if (project.startDate && project.dueDate && project.dueDate > project.startDate) {
    const span = Date.parse(project.dueDate) - Date.parse(project.startDate);
    expected = Math.max(0, Math.min(100, Math.round(((Date.now() - Date.parse(project.startDate)) / span) * 100)));
  }
  const pastDue = typeof project.dueDate === 'string' && project.dueDate < today && percentage < 100;
  const behind = expected !== null ? expected - percentage : 0;

  let health: 'on_track' | 'at_risk' | 'delayed' = 'on_track';
  if (pastDue || (total > 0 && overdue.length / total >= 0.3)) health = 'delayed';
  else if (overdue.length > 0 || behind >= 20) health = 'at_risk';

  const name = project.name || 'Proyek';
  const late = overdue.slice(0, 3).map((t) => `"${t.title}"`).join(', ');
  res.json({
    projectName: name,
    completionRate: `${percentage}%`,
    stats: { total, done, inProgress: count('in_progress'), review: count('review'), todo: count('todo'), overdue: overdue.length },
    healthStatus: health,
    summary: total === 0
      ? `Proyek "${name}" belum memiliki tugas.`
      : `Proyek "${name}": ${done} dari ${total} tugas selesai (${percentage}%), ${count('in_progress')} sedang dikerjakan, ${count('review')} di review, ${overdue.length} melewati tenggat${expected !== null ? `. Waktu proyek terpakai ${expected}%` : ''}.`,
    recommendation: pastDue
      ? 'Tenggat proyek sudah lewat. Tetapkan ulang tenggat bersama klien atau tutup tugas yang tersisa.'
      : overdue.length > 0
        ? `Selesaikan dulu tugas terlambat: ${late}${overdue.length > 3 ? ', dan lainnya' : ''}.`
        : behind >= 20
          ? 'Progres tertinggal dari jadwal. Prioritaskan tugas di kolom review dan dikerjakan sebelum menambah item baru.'
          : percentage >= 80
            ? 'Proyek mendekati rampung. Lakukan verifikasi akhir dan serah terima.'
            : 'Progres sesuai jadwal. Pertahankan ritme kerja.',
    source: 'analisis',
  });
}

// ─── Webhook Slack / Discord ───

export async function sendWebhook(req: AuthRequest, res: Response): Promise<void> {
  if (!isAdmin(req.user)) return void denyAdmin(res);
  if (!(await requirePlan(res, req.user!.workspace_id!, 'bisnis', 'Integrasi Slack/Discord'))) return;

  const check = validateWebhook(req.body?.webhookUrl, req.body?.service);
  if (!check.ok) {
    res.status(422).json({ message: check.message });
    return;
  }
  const message = req.body?.message;
  const title = isStr(req.body?.title) ? req.body.title.slice(0, 150) : 'Notifikasi Rampung';
  if (!isStr(message) || message.trim().length === 0 || message.length > 1500) {
    res.status(422).json({ message: 'Pesan wajib diisi (maksimal 1500 karakter).' });
    return;
  }

  const payload =
    check.service === 'slack'
      ? { text: `*${title}*\n${message}` }
      : { content: `**${title}**\n${message}`, embeds: [{ title, description: message, color: 0x0f9d8a, timestamp: new Date().toISOString() }] };

  let status: number;
  try {
    const r = await fetch(check.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'error', // jangan ikuti pengalihan ke alamat lain
      signal: AbortSignal.timeout(8000),
    });
    status = r.status;
  } catch {
    res.status(502).json({ message: `Tidak dapat menghubungi ${check.service}.` });
    return;
  }
  if (status < 200 || status >= 300) {
    res.status(502).json({ message: `${check.service === 'slack' ? 'Slack' : 'Discord'} menolak pesan (HTTP ${status}). Periksa URL webhook.` });
    return;
  }
  res.json({ status: 'sent', service: check.service, sentAt: new Date().toISOString(), message: 'Pesan terkirim.' });
}
