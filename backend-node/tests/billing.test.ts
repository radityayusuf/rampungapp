import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { effectivePlan, quote, sanitizeModules, addMonths } from '../src/services/plans';
import { app, auth, push, resetDb, setPlan, signUp, team } from './helpers';

const ws = async (id: number) => (await prisma.workspaces.findUnique({ where: { id: BigInt(id) } }))!;
const billing = (t: string) => request(app).get('/api/billing').set(auth(t));
const project = (id: string, status = 'active') => ({ c: 'projects', id, data: { id, name: `Proyek ${id}`, status } });

beforeEach(async () => {
  await resetDb();
});

describe('aturan paket (unit)', () => {
  it('harga sesuai konsep: per pengguna per bulan, tahunan dibayar 10 bulan untuk 12 bulan', () => {
    expect(quote('pro', 'monthly', 4)).toMatchObject({ amount: 140_000, months: 1, seats: 4 });
    expect(quote('bisnis', 'yearly', 3)).toMatchObject({ amount: 2_250_000, months: 12 });
    expect(quote('pro', 'monthly', 0).seats).toBe(1);
  });

  it('paket kedaluwarsa kembali ke Gratis; Enterprise tanpa batas waktu tetap Enterprise', () => {
    expect(effectivePlan({ plan: 'pro', plan_until: new Date(Date.now() - 1000) })).toBe('gratis');
    expect(effectivePlan({ plan: 'pro', plan_until: new Date(Date.now() + 1000) })).toBe('pro');
    expect(effectivePlan({ plan: 'enterprise', plan_until: null })).toBe('enterprise');
    expect(effectivePlan({ plan: 'karangan', plan_until: null })).toBe('gratis');
  });

  it('modul diselaraskan dengan paket (Pro: maks. 1 modul bisnis; integrasi & AI khusus Bisnis)', () => {
    const all = { timeTracking: true, crm: true, finance: true, sdm: true, integrations: true, aiAssistant: true };
    expect(Object.values(sanitizeModules('gratis', all)).some(Boolean)).toBe(false);
    const pro = sanitizeModules('pro', all);
    expect(Object.entries(pro).filter(([, v]) => v).map(([k]) => k)).toEqual(['timeTracking']);
    expect(sanitizeModules('bisnis', all)).toEqual(all);
  });

  it('penambahan bulan tidak meloncat (31 Jan + 1 bulan = akhir Februari)', () => {
    expect(addMonths(new Date(2027, 0, 31), 1).getMonth()).toBe(1);
  });
});

describe('paket ditentukan server, bukan klien', () => {
  it('workspace baru = Gratis; klien tidak bisa mengaku Enterprise lewat sinkronisasi', async () => {
    const a = await signUp();
    expect((await billing(a.token).expect(200)).body).toMatchObject({ plan: 'gratis', planUntil: null, trialAvailable: true, prices: { pro: 35000, bisnis: 75000 } });

    await push(a.token, [{ c: 'workspace', id: 'ws', data: { id: 'ws', name: 'Saya', plan: 'enterprise', enabledModules: { crm: true, finance: true, aiAssistant: true } } }]).expect(200);
    const w = (await request(app).get('/api/sync').set(auth(a.token))).body.collections.workspace[0];
    expect(w).toMatchObject({ name: 'Saya', plan: 'gratis', planUntil: null });
    expect(Object.values(w.enabledModules).some(Boolean)).toBe(false);
    // tersimpan pun sudah dinormalisasi
    const stored = JSON.parse((await prisma.records.findFirst({ where: { collection: 'workspace' } }))!.data);
    expect(stored.plan).toBe('gratis');
  });

  it('paket yang kedaluwarsa otomatis turun ke Gratis dan modulnya dimatikan', async () => {
    const a = await signUp();
    await setPlan(a.workspaceId, 'bisnis');
    await push(a.token, [{ c: 'workspace', id: 'ws', data: { id: 'ws', enabledModules: { crm: true, aiAssistant: true } } }]).expect(200);
    expect((await request(app).get('/api/sync').set(auth(a.token))).body.collections.workspace[0].enabledModules.crm).toBe(true);

    await prisma.workspaces.update({ where: { id: BigInt(a.workspaceId) }, data: { plan_until: new Date(Date.now() - 1000) } });
    const w = (await request(app).get('/api/sync').set(auth(a.token))).body.collections.workspace[0];
    expect(w.plan).toBe('gratis');
    expect(w.enabledModules.crm).toBe(false);
    expect((await billing(a.token)).body).toMatchObject({ plan: 'gratis', expired: true });
  });
});

describe('batas paket Gratis ditegakkan di server', () => {
  it('maks. 3 proyek aktif; menutup proyek membuka slot; workspace lama di atas batas tetap bisa mengubah proyeknya', async () => {
    const a = await signUp();
    await push(a.token, [project('p1'), project('p2'), project('p3')]).expect(200);
    const r = await push(a.token, [project('p4')]).expect(403);
    expect(r.body.message).toContain('3 proyek aktif');

    await push(a.token, [project('p1', 'completed')]).expect(200);
    await push(a.token, [project('p4')]).expect(200);

    // berbayar → tanpa batas; lalu kembali Gratis dengan 5 proyek aktif: ubah yang ada boleh, tambah tidak
    await setPlan(a.workspaceId, 'pro');
    await push(a.token, [project('p5'), project('p6')]).expect(200);
    await setPlan(a.workspaceId, 'gratis');
    await push(a.token, [{ c: 'projects', id: 'p5', data: { id: 'p5', name: 'Diubah', status: 'active' } }]).expect(200);
    await push(a.token, [project('p7')]).expect(403);
    await push(a.token, [{ c: 'projects', id: 'p6', data: null }]).expect(200); // menghapus selalu boleh
  });

  it('maks. 5 anggota termasuk undangan tertunda; bergabung saat penuh ditolak', async () => {
    const owner = await signUp('Pemilik');
    const invite = (email: string) => request(app).post('/api/invites').set(auth(owner.token)).send({ email, role: 'member' });
    const tokens: string[] = [];
    for (let i = 1; i <= 4; i++) tokens.push((await invite(`u${i}@test.id`).expect(201)).body.token);
    const full = await invite('u5@test.id').expect(402);
    expect(full.body.message).toContain('5 anggota');
    await invite('u1@test.id').expect(201); // mengundang ulang orang yang sama tidak dihitung dua kali

    // pemilik dipindah ke Pro, undang orang ke-5, lalu kembali Gratis: yang ke-5 tidak bisa bergabung
    await setPlan(owner.workspaceId, 'pro');
    const t5 = (await invite('u5@test.id').expect(201)).body.token;
    await signUp('Satu', { email: 'u2@test.id', invite: tokens[1] });
    await setPlan(owner.workspaceId, 'gratis');
    await request(app).post('/api/auth/register').send({ name: 'Lima', email: 'u5@test.id', password: 'rahasia123', invite: t5 }).expect(201); // 2 anggota + 1 = 3 ≤ 5
    expect(await prisma.users.count({ where: { workspace_id: BigInt(owner.workspaceId) } })).toBe(3);
  });

  it('bergabung ditolak bila workspace sudah berisi 5 anggota', async () => {
    const owner = await signUp('Pemilik');
    await setPlan(owner.workspaceId, 'pro');
    const toks: string[] = [];
    for (let i = 1; i <= 5; i++) toks.push((await request(app).post('/api/invites').set(auth(owner.token)).send({ email: `m${i}@test.id`, role: 'member' }).expect(201)).body.token);
    for (let i = 1; i <= 4; i++) await signUp(`M${i}`, { email: `m${i}@test.id`, invite: toks[i - 1] });
    await setPlan(owner.workspaceId, 'gratis');
    const r = await request(app).post('/api/auth/register').send({ name: 'M5', email: 'm5@test.id', password: 'rahasia123', invite: toks[4] }).expect(402);
    expect(r.body.message).toContain('5 anggota');
  });

  it('penyimpanan 1 GB: unggahan yang melampaui ditolak dan berkasnya tidak tertinggal', async () => {
    const a = await signUp();
    await prisma.uploads.create({ data: { workspace_id: BigInt(a.workspaceId), original_name: 'besar.zip', stored_name: 'x', mime_type: 'application/zip', size: BigInt(1024 ** 3 - 10), uploaded_by: BigInt(a.id) } });
    const before = (await import('node:fs')).readdirSync(require('node:path').resolve(__dirname, '../uploads')).length;
    const r = await request(app).post('/api/upload').set(auth(a.token)).attach('file', Buffer.alloc(100), 'catatan.txt').expect(402);
    expect(r.body.message).toContain('1 GB');
    expect((await import('node:fs')).readdirSync(require('node:path').resolve(__dirname, '../uploads')).length).toBe(before);
  });

  it('fitur Bisnis (WhatsApp, AI, webhook) dijawab 402 pada paket di bawahnya', async () => {
    const a = await signUp();
    const post = (p: string, body: object) => request(app).post(p).set(auth(a.token)).send(body);
    for (const [p, body] of [
      ['/api/integrations/whatsapp/send', { phone: '081234567890', message: 'x' }],
      ['/api/integrations/ai/breakdown', { title: 'x' }],
      ['/api/integrations/webhook/send', { webhookUrl: 'https://discord.com/api/webhooks/1/a', service: 'discord', message: 'x' }],
    ] as const) {
      const r = await post(p, body).expect(402);
      expect(r.body.requiredPlan).toBe('bisnis');
    }
    await setPlan(a.workspaceId, 'pro');
    await post('/api/integrations/ai/breakdown', { title: 'x' }).expect(402);
    // ringkasan proyek (analisis, bukan AI) tersedia di semua paket
    await post('/api/integrations/ai/summarize', { projectId: 'tidak-ada' }).expect(404);
  });

  it('portal klien hanya untuk paket Bisnis', async () => {
    const a = await signUp();
    const TOKEN = 'abcDEF1234567890abcdWXYZ';
    await setPlan(a.workspaceId, 'bisnis');
    await push(a.token, [{ c: 'projects', id: 'p1', data: { id: 'p1', name: 'X', clientPortalEnabled: true, portalToken: TOKEN } }]).expect(200);
    await request(app).get(`/api/portal/${TOKEN}`).expect(200);
    await setPlan(a.workspaceId, 'pro');
    await request(app).get(`/api/portal/${TOKEN}`).expect(404);
  });
});

describe('uji coba Pro 14 hari', () => {
  it('sekali per workspace; hanya pemilik/admin; tidak berlaku bila sudah berbayar', async () => {
    const { owner, member } = await team();
    await request(app).post('/api/billing/trial').set(auth(member.token)).expect(403);
    const r = await request(app).post('/api/billing/trial').set(auth(owner.token)).expect(200);
    expect(r.body).toMatchObject({ plan: 'pro', trial: true });
    const days = (new Date(r.body.planUntil).getTime() - Date.now()) / 864e5;
    expect(Math.round(days)).toBe(14);
    await request(app).post('/api/billing/trial').set(auth(owner.token)).expect(409);

    await prisma.workspaces.update({ where: { id: BigInt(owner.workspaceId) }, data: { plan_until: new Date(Date.now() - 1000) } });
    await request(app).post('/api/billing/trial').set(auth(owner.token)).expect(409); // sudah pernah dipakai

    const paid = await signUp('Berbayar');
    await setPlan(paid.workspaceId, 'bisnis');
    await request(app).post('/api/billing/trial').set(auth(paid.token)).expect(409);
  });
});

describe('superadmin menetapkan paket', () => {
  it('hanya superadmin; validasi paket & tanggal; workspace langsung berubah', async () => {
    const a = await signUp('Klien');
    const s = await signUp('Super');
    const set = (t: string, body: object, id = a.workspaceId) => request(app).patch(`/api/system/workspaces/${id}/plan`).set(auth(t)).send(body);

    await set(a.token, { plan: 'enterprise' }).expect(403);
    await prisma.users.update({ where: { id: BigInt(s.id) }, data: { role: 'superadmin' } });
    await set(s.token, { plan: 'emas' }).expect(422);
    await set(s.token, { plan: 'pro', until: '2000-01-01' }).expect(422);
    await set(s.token, { plan: 'pro', until: '2999-01-01' }).expect(422); // di luar rentang TIMESTAMP MySQL
    await set(s.token, { plan: 'enterprise' }, 999999).expect(404);

    await set(s.token, { plan: 'enterprise' }).expect(200);
    expect((await billing(a.token)).body).toMatchObject({ plan: 'enterprise', planUntil: null });
    const ws = (await request(app).get('/api/system/workspaces').set(auth(s.token))).body.workspaces.find((w: { id: number }) => w.id === a.workspaceId);
    expect(ws.plan).toBe('enterprise');
  });
});
