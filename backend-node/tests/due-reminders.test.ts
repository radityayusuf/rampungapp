import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { runDueReminders } from '../src/services/dueReminders';
import { pull, push, resetDb, setPlan, signUp, task, useDefaultPlan } from './helpers';

beforeEach(async () => {
  await resetDb();
  useDefaultPlan('pro');
});

/** 25 Nov 2026 pukul 09.00 WIB; besok = 26 Nov. */
const NOW = new Date('2026-11-25T02:00:00Z');
const rule = (id: string, action: string, extra: Record<string, unknown> = {}) => ({ c: 'automations', id, data: { id, name: id, trigger: 'due_soon', action, isActive: true, runCount: 0, ...extra } });
const due = (id: string, dueDate: string, extra: Record<string, unknown> = {}) => task(id, `Tugas ${id}`, { dueDate, status: 'todo', priority: 'medium', assigneeId: 'u1', ...extra });
const cols = async (t: string) => (await pull(t)).body.collections;

describe('otomasi "Tenggat besok"', () => {
  it('memberi tahu penanggung jawab tepat sekali, hanya untuk tugas yang jatuh tempo besok dan belum selesai', async () => {
    const a = await signUp();
    await push(a.token, [rule('r1', 'notify_assignee'), due('besok', '2026-11-26'), due('selesai', '2026-11-26', { status: 'done' }), due('hariini', '2026-11-25'), due('lusa', '2026-11-27'), due('awal', '2026-12-01', { startDate: '2026-11-26' })]).expect(200);
    const rev = (await pull(a.token)).body.rev;

    expect(await runDueReminders(NOW)).toBe(1);
    const c = await cols(a.token);
    expect(c.notifications).toMatchObject([{ userId: 'u1', actorId: 'system', kind: 'due', taskId: 'besok', read: false }]);
    expect(c.automations[0].runCount).toBe(1);
    expect((await pull(a.token)).body.rev).toBe(rev + 1); // layar yang terbuka ikut menarik
    expect(JSON.stringify(c)).not.toContain('automationRuns');

    expect(await runDueReminders(NOW)).toBe(0);
    expect(await runDueReminders(new Date(NOW.getTime() + 3600e3))).toBe(0);
    expect((await cols(a.token)).notifications).toHaveLength(1);
  });

  it('prioritas dinaikkan sekali; diturunkan lagi oleh tim tidak ditimpa; tenggat baru memicu lagi', async () => {
    const a = await signUp();
    await push(a.token, [rule('r1', 'set_priority_high'), due('t1', '2026-11-26')]).expect(200);
    await runDueReminders(NOW);
    expect((await cols(a.token)).tasks[0].priority).toBe('high');
    await push(a.token, [due('t1', '2026-11-26', { priority: 'low' })]).expect(200);
    await runDueReminders(NOW);
    expect((await cols(a.token)).tasks[0].priority).toBe('low');
    await push(a.token, [due('t1', '2026-11-27', { priority: 'low' })]).expect(200);
    await runDueReminders(new Date('2026-11-26T02:00:00Z'));
    expect((await cols(a.token)).tasks[0].priority).toBe('high');
  });

  it('memakai tanggal WIB dan tidak mengirim sebelum pukul 07.00', async () => {
    const a = await signUp();
    await push(a.token, [rule('r1', 'notify_assignee'), due('t1', '2026-11-26')]).expect(200);
    expect(await runDueReminders(new Date('2026-11-24T18:00:00Z'))).toBe(0); // 25 Nov 01.00 WIB
    expect(await runDueReminders(new Date('2026-11-24T23:59:00Z'))).toBe(0); // 06.59 WIB
    expect(await runDueReminders(new Date('2026-11-25T00:00:00Z'))).toBe(1); // 07.00 WIB
  });

  it('dilewati: aturan mati, aksi WhatsApp, pemicu lain, dan paket Gratis', async () => {
    const a = await signUp();
    await push(a.token, [rule('r1', 'notify_assignee', { isActive: false }), rule('r2', 'notify_whatsapp'), rule('r3', 'notify_client'), rule('r4', 'notify_assignee', { trigger: 'task_created', name: 'due_soon' }), due('t1', '2026-11-26')]).expect(200);
    expect(await runDueReminders(NOW)).toBe(0);
    await push(a.token, [rule('r1', 'notify_assignee')]).expect(200);
    await setPlan(a.workspaceId, 'gratis');
    expect(await runDueReminders(NOW)).toBe(0);
    await setPlan(a.workspaceId, 'pro');
    expect(await runDueReminders(NOW)).toBe(1);
  });

  it('tidak mencampur workspace dan dua proses bersamaan tidak menggandakan', async () => {
    const a = await signUp();
    const b = await signUp();
    await push(a.token, [rule('r1', 'notify_assignee'), due('t1', '2026-11-26')]).expect(200);
    await push(b.token, [due('t1', '2026-11-26')]).expect(200);
    await Promise.all([runDueReminders(NOW), runDueReminders(NOW)]);
    expect((await cols(a.token)).notifications).toHaveLength(1);
    expect((await cols(b.token)).notifications).toHaveLength(0);
    expect(await prisma.records.count({ where: { collection: 'automationRuns' } })).toBe(1);
  });
});
