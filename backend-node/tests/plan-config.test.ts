import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { DEFAULT_PLAN_CONFIG, getPlanConfig, loadPlanConfig, resetPlanConfig } from '../src/services/planConfig';
import { LIMITS, PLAN_PRICE_MONTH } from '../src/services/plans';
import { app, auth, push, resetDb, signUp } from './helpers';


async function superadmin() {
  const s = await signUp('Super');
  await prisma.users.update({ where: { id: BigInt(s.id) }, data: { role: 'superadmin' } });
  return s;
}
const cfg = (over: Record<string, unknown> = {}) => ({ ...structuredClone(DEFAULT_PLAN_CONFIG), ...over });
const put = (t: string, body: object) => request(app).put('/api/system/plans').set(auth(t)).send(body);
const project = (id: string) => ({ c: 'projects', id, data: { id, name: `Proyek ${id}`, status: 'active' } });

beforeEach(async () => {
  await resetDb();
});

describe('katalog paket publik', () => {
  it('tanpa login; memuat harga, batas, deskripsi, dan fitur bawaan', async () => {
    const r = await request(app).get('/api/plans').expect(200);
    expect(r.body.trialDays).toBe(14);
    expect(r.body.yearlyChargedMonths).toBe(10);
    const pro = r.body.plans.find((p: { key: string }) => p.key === 'pro');
    expect(pro).toMatchObject({ monthly: 149_000, popular: true, limits: { members: 10 } });
    expect(r.body.plans.find((p: { key: string }) => p.key === 'gratis').limits).toEqual({ members: 5, activeProjects: 3, storageGb: 1 });
  });
});

describe('Superadmin mengelola paket & batas', () => {
  it('hanya Superadmin; pemilik workspace biasa ditolak', async () => {
    const owner = await signUp('Pemilik');
    await request(app).get('/api/system/plans').set(auth(owner.token)).expect(403);
    await put(owner.token, cfg()).expect(403);
    await request(app).put('/api/system/plans').send(cfg()).expect(401);
  });

  it('validasi: harga, urutan harga, periode, uji coba, modul, batas, deskripsi, jumlah fitur', async () => {
    const s = await superadmin();
    const bad: [Record<string, unknown>, string][] = [
      [{ prices: { pro: 500, bisnis: 349_000 } }, 'Harga paket Pro dan Bisnis'],
      [{ limits: { ...DEFAULT_PLAN_CONFIG.limits, pro: { members: 30, activeProjects: null, storageGb: null }, bisnis: { members: 10, activeProjects: null, storageGb: null } } }, 'Batas anggota Bisnis'],
      [{ prices: { pro: 80_000, bisnis: 75_000 } }, 'tidak boleh lebih murah'],
      [{ yearlyChargedMonths: 13 }, 'Tagihan tahunan'],
      [{ trialDays: 120 }, 'uji coba'],
      [{ proBusinessModules: 9 }, 'modul bisnis'],
      [{ limits: { ...DEFAULT_PLAN_CONFIG.limits, gratis: { members: 0, activeProjects: 3, storageGb: 1 } } }, 'anggota paket Gratis'],
      [{ limits: { ...DEFAULT_PLAN_CONFIG.limits, gratis: { members: 5, activeProjects: 3, storageGb: 0 } } }, 'penyimpanan paket Gratis'],
      [{ catalog: { ...DEFAULT_PLAN_CONFIG.catalog, pro: { desc: '', items: [] } } }, 'Deskripsi paket Pro'],
      [{ catalog: { ...DEFAULT_PLAN_CONFIG.catalog, bisnis: { desc: 'x', items: Array.from({ length: 9 }, (_, i) => `F${i}`) } } }, 'maksimal 8'],
    ];
    for (const [over, msg] of bad) {
      const r = await put(s.token, cfg(over)).expect(422);
      expect(r.body.message).toContain(msg);
    }
    expect(getPlanConfig()).toEqual(DEFAULT_PLAN_CONFIG); // tidak ada yang tersimpan
  });

  it('perubahan langsung ditegakkan: harga checkout, batas anggota & proyek, uji coba dimatikan', async () => {
    const s = await superadmin();
    await request(app).put('/api/system/payment-settings').set(auth(s.token)).send({ accounts: [{ bank: 'BCA', number: '1234567890', holder: 'PT Rampung' }], uniqueCode: false }).expect(200);
    const next = cfg({
      prices: { pro: 50_000, bisnis: 90_000 },
      yearlyChargedMonths: 12,
      trialDays: 0,
      limits: { ...DEFAULT_PLAN_CONFIG.limits, gratis: { members: 2, activeProjects: 1, storageGb: 0.5 } },
      catalog: { ...DEFAULT_PLAN_CONFIG.catalog, pro: { desc: 'Paket tim yang sedang tumbuh.', items: ['Proyek tanpa batas', 'Otomasi'] } },
    });
    await put(s.token, next).expect(200);

    // katalog publik ikut berubah
    const pub = (await request(app).get('/api/plans')).body;
    expect(pub.plans.find((p: { key: string }) => p.key === 'pro')).toMatchObject({ monthly: 50_000, desc: 'Paket tim yang sedang tumbuh.', items: ['Proyek tanpa batas', 'Otomasi'] });
    expect(PLAN_PRICE_MONTH.pro).toBe(50_000);
    expect(LIMITS.gratis.storageBytes).toBe(Math.round(0.5 * 1024 ** 3));

    const owner = await signUp('Pemilik');
    const b = (await request(app).get('/api/billing').set(auth(owner.token))).body;
    expect(b).toMatchObject({ prices: { pro: 50_000, bisnis: 90_000 }, trialAvailable: false, limits: { members: 2, activeProjects: 1 } });
    expect(b.periods.yearly).toEqual({ months: 12, charged: 12 });

    // checkout memakai harga baru (tahunan dibayar 12 bulan)
    const co = await request(app).post('/api/billing/checkout').set(auth(owner.token)).send({ plan: 'pro', period: 'yearly' }).expect(201);
    expect(co.body.amount).toBe(50_000 * 12);

    // batas proyek aktif = 1
    await push(owner.token, [project('p1')]).expect(200);
    const r = await push(owner.token, [project('p2')]).expect(403);
    expect(r.body.message).toContain('1 proyek aktif');

    // batas anggota = 2 (pemilik + 1)
    await request(app).post('/api/invites').set(auth(owner.token)).send({ email: 'a@test.id', role: 'member' }).expect(201);
    const inv = await request(app).post('/api/invites').set(auth(owner.token)).send({ email: 'b@test.id', role: 'member' }).expect(402);
    expect(inv.body.message).toContain('2 anggota');

    // uji coba dimatikan
    await request(app).post('/api/billing/trial').set(auth(owner.token)).expect(409);

    // penyimpanan 0,5 GB: pesan menyebut batas pecahan
    await prisma.uploads.create({ data: { workspace_id: BigInt(owner.workspaceId), original_name: 'besar.zip', stored_name: 'x', mime_type: 'application/zip', size: BigInt(Math.round(0.5 * 1024 ** 3) - 10), uploaded_by: BigInt(owner.id) } });
    const up = await request(app).post('/api/upload').set(auth(owner.token)).attach('file', Buffer.alloc(100), 'catatan.txt').expect(402);
    expect(up.body.message).toContain('0,5 GB');
  });

  it('tersimpan di database dan dimuat ulang saat server mulai', async () => {
    const s = await superadmin();
    await put(s.token, cfg({ prices: { pro: 40_000, bisnis: 80_000 }, proBusinessModules: 2 })).expect(200);
    resetPlanConfig(); // seolah server baru dinyalakan
    expect(PLAN_PRICE_MONTH.pro).toBe(149_000);
    await loadPlanConfig();
    expect(PLAN_PRICE_MONTH.pro).toBe(40_000);
    expect(getPlanConfig().proBusinessModules).toBe(2);
    expect((await request(app).get('/api/system/plans').set(auth(s.token)).expect(200)).body.config.prices.pro).toBe(40_000);
  });

  it('jumlah modul bisnis paket Pro mengikuti pengaturan', async () => {
    const s = await superadmin();
    await put(s.token, cfg({ proBusinessModules: 2 })).expect(200);
    const owner = await signUp('Pemilik');
    await prisma.workspaces.update({ where: { id: BigInt(owner.workspaceId) }, data: { plan: 'pro', plan_until: new Date(Date.now() + 30 * 864e5) } });
    await push(owner.token, [{ c: 'workspace', id: 'ws', data: { id: 'ws', enabledModules: { crm: true, finance: true, sdm: true } } }]).expect(200);
    const w = (await request(app).get('/api/sync').set(auth(owner.token))).body.collections.workspace[0];
    expect(Object.values(w.enabledModules).filter(Boolean)).toHaveLength(2);
  });
});

describe('aman bila data rusak', () => {
  it('konfigurasi rusak di database diabaikan; server memakai bawaan', async () => {
    await prisma.platform_settings.create({ data: { key: 'plans', value: '{rusak' } });
    await loadPlanConfig();
    expect(getPlanConfig()).toEqual(DEFAULT_PLAN_CONFIG);
  });
});
