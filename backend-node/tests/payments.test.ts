import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { addMonths } from '../src/services/plans';
import { app, auth, resetDb, setPlan, signUp, team } from './helpers';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 2)]);
const proofDir = path.resolve(__dirname, '../uploads/proofs');

const ws = async (id: number) => (await prisma.workspaces.findUnique({ where: { id: BigInt(id) } }))!;
const billing = (t: string) => request(app).get('/api/billing').set(auth(t));
const checkout = (t: string, body: object) => request(app).post('/api/billing/checkout').set(auth(t)).send(body);
const proof = (t: string, orderId: string, buf: Buffer = PNG, name = 'bukti.png') =>
  request(app).post(`/api/billing/payments/${orderId}/proof`).set(auth(t)).field('senderName', 'Budi').field('method', 'bank').attach('proof', buf, name);
const sys = (t: string) => ({
  get: (u: string) => request(app).get(`/api/system${u}`).set(auth(t)),
  put: (u: string, b: object) => request(app).put(`/api/system${u}`).set(auth(t)).send(b),
  post: (u: string, b: object = {}) => request(app).post(`/api/system${u}`).set(auth(t)).send(b),
  del: (u: string) => request(app).delete(`/api/system${u}`).set(auth(t)),
});

async function superadmin() {
  const s = await signUp('Super');
  await prisma.users.update({ where: { id: BigInt(s.id) }, data: { role: 'superadmin' } });
  return s;
}

const ACCOUNTS = [{ bank: 'BCA', number: '1234567890', holder: 'PT Rampung Jaya' }];
/** Siapkan tujuan pembayaran lewat API superadmin (seperti di panel). */
async function configurePayments(token: string, over: object = {}) {
  await sys(token).put('/payment-settings', { accounts: ACCOUNTS, qrisName: 'Rampung', instructions: 'Konfirmasi via WhatsApp', uniqueCode: true, ...over }).expect(200);
  await request(app).put('/api/system/payment-settings/qris').set(auth(token)).attach('qris', PNG, 'qris.png').expect(200);
}

beforeEach(async () => {
  await resetDb();
});

describe('pengaturan tujuan pembayaran (superadmin)', () => {
  it('hanya superadmin yang boleh membaca/mengubah; pembeli hanya melihat bagian publiknya', async () => {
    const a = await signUp('Klien');
    const s = await superadmin();
    for (const call of [
      () => sys(a.token).get('/payment-settings'),
      () => sys(a.token).put('/payment-settings', { accounts: [] }),
      () => request(app).put('/api/system/payment-settings/qris').set(auth(a.token)).attach('qris', PNG, 'q.png'),
      () => sys(a.token).del('/payment-settings/qris'),
      () => sys(a.token).get('/payments'),
      () => sys(a.token).get('/payments/export'),
      () => sys(a.token).post('/payments/1/approve'),
      () => sys(a.token).post('/payments/1/reject', { note: 'tidak sesuai' }),
      () => sys(a.token).get('/payments/1/proof'),
    ]) await call().expect(403);

    expect((await billing(a.token)).body).toMatchObject({ paymentsConfigured: false });
    await configurePayments(s.token);
    const b = (await billing(a.token)).body;
    expect(b.paymentsConfigured).toBe(true);
    expect(b.paymentInfo.accounts[0]).toMatchObject({ bank: 'BCA', number: '1234567890', holder: 'PT Rampung Jaya' });
    expect(b.paymentInfo.qrisImage).toMatch(/^data:image\/png;base64,/);
  });

  it('validasi: nomor rekening, kolom wajib, batas jumlah; gambar QRIS diperiksa isinya', async () => {
    const s = await superadmin();
    const put = (b: object) => sys(s.token).put('/payment-settings', b);
    await put({ accounts: [{ bank: 'BCA', number: 'abc', holder: 'X' }] }).expect(422);
    await put({ accounts: [{ bank: '', number: '1234567890', holder: 'X' }] }).expect(422);
    await put({ accounts: 'bukan-daftar' }).expect(422);
    await put({ accounts: Array.from({ length: 11 }, () => ACCOUNTS[0]) }).expect(422);
    await put({ accounts: ACCOUNTS }).expect(200);

    const up = (buf: Buffer, name: string) => request(app).put('/api/system/payment-settings/qris').set(auth(s.token)).attach('qris', buf, name);
    await up(Buffer.from('<svg onload=alert(1)>'), 'x.png').expect(422); // ekstensi png tapi bukan gambar
    await up(PNG, 'x.svg').expect(415);
    await up(Buffer.alloc(1024 * 1024 + 10, 0x89), 'besar.png').expect(413);
    await up(PNG, 'ok.png').expect(200);

    await sys(s.token).del('/payment-settings/qris').expect(200);
    expect((await sys(s.token).get('/payment-settings')).body).toMatchObject({ qrisImage: null, configured: true });
  });

  it('menyimpan rekening tidak menghapus QRIS yang sudah diunggah', async () => {
    const s = await superadmin();
    await configurePayments(s.token);
    await sys(s.token).put('/payment-settings', { accounts: [], qrisName: 'Baru' }).expect(200);
    expect((await sys(s.token).get('/payment-settings')).body).toMatchObject({ accounts: [], qrisName: 'Baru', configured: true });
    expect((await sys(s.token).get('/payment-settings')).body.qrisImage).toMatch(/^data:image\/png/);
  });
});

describe('pembelian paket: tagihan manual', () => {
  it('belum diatur → 503; hanya pemilik; validasi paket & periode', async () => {
    const { owner, member } = await team('admin');
    await checkout(owner.token, { plan: 'pro', period: 'monthly' }).expect(503);
    const s = await superadmin();
    await configurePayments(s.token);
    await checkout(member.token, { plan: 'pro', period: 'monthly' }).expect(403); // admin pun bukan pemilik
    for (const bad of [{ plan: 'enterprise', period: 'monthly' }, { plan: 'gratis', period: 'monthly' }, { plan: 'pro', period: 'mingguan' }, {}]) {
      await checkout(owner.token, bad).expect(422);
    }
  });

  it('nominal dihitung server (harga tetap paket × bulan) + kode unik 1–999; tagihan sama dipakai ulang; berlaku 48 jam', async () => {
    const s = await superadmin();
    await configurePayments(s.token);
    const { owner } = await team(); // 2 anggota
    const r = await checkout(owner.token, { plan: 'pro', period: 'monthly' }).expect(201);
    expect(r.body).toMatchObject({ status: 'pending', baseAmount: 149_000, meta: { plan: 'pro', period: 'monthly', seats: 2, months: 1 } });
    expect(r.body.uniqueCode).toBeGreaterThanOrEqual(1);
    expect(r.body.uniqueCode).toBeLessThanOrEqual(999);
    expect(r.body.amount).toBe(149_000 + r.body.uniqueCode);
    expect(r.body.orderId).toMatch(/^RMP-\d+-[0-9A-F]{10}$/);
    const hours = (new Date(r.body.expiresAt).getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(47.9);
    expect(hours).toBeLessThan(48.1);

    expect((await checkout(owner.token, { plan: 'pro', period: 'monthly' }).expect(200)).body.orderId).toBe(r.body.orderId);
    expect((await checkout(owner.token, { plan: 'bisnis', period: 'monthly' }).expect(201)).body.orderId).not.toBe(r.body.orderId);
    expect((await ws(owner.workspaceId)).plan).toBe('gratis'); // membuat tagihan tidak mengubah paket
  });

  it('kode unik tidak bentrok antar tagihan aktif dengan nominal dasar sama; dapat dimatikan superadmin', async () => {
    const s = await superadmin();
    await configurePayments(s.token);
    const codes = new Set<number>();
    for (let i = 0; i < 12; i++) {
      const u = await signUp(`U${i}`);
      codes.add((await checkout(u.token, { plan: 'pro', period: 'monthly' }).expect(201)).body.uniqueCode);
    }
    expect(codes.size).toBe(12);

    await sys(s.token).put('/payment-settings', { accounts: ACCOUNTS, uniqueCode: false }).expect(200);
    const z = await signUp('Tanpa');
    expect((await checkout(z.token, { plan: 'pro', period: 'monthly' }).expect(201)).body).toMatchObject({ uniqueCode: 0, amount: 149_000 });
  });

  it('tagihan kedaluwarsa tampil "expired" dan boleh dibuat ulang; pembatalan hanya untuk yang belum ada bukti', async () => {
    const s = await superadmin();
    await configurePayments(s.token);
    const a = await signUp();
    const r = await checkout(a.token, { plan: 'pro', period: 'monthly' }).expect(201);
    await prisma.payments.updateMany({ where: { order_id: r.body.orderId }, data: { expires_at: new Date(Date.now() - 1000) } });
    expect((await request(app).get(`/api/billing/payments/${r.body.orderId}`).set(auth(a.token))).body.status).toBe('expired');
    expect((await billing(a.token)).body.pending).toBeNull();
    const r2 = await checkout(a.token, { plan: 'pro', period: 'monthly' }).expect(201);
    expect(r2.body.orderId).not.toBe(r.body.orderId);

    await request(app).post(`/api/billing/payments/${r2.body.orderId}/cancel`).set(auth(a.token)).expect(200);
    expect((await request(app).get(`/api/billing/payments/${r2.body.orderId}`).set(auth(a.token))).body.status).toBe('expired');

    const r3 = await checkout(a.token, { plan: 'pro', period: 'monthly' }).expect(201);
    await proof(a.token, r3.body.orderId).expect(200);
    await request(app).post(`/api/billing/payments/${r3.body.orderId}/cancel`).set(auth(a.token)).expect(409);
  });
});

describe('paket bertingkat berharga tetap', () => {
  it('nominal sama untuk tim 1 maupun 9 anggota; tidak dikalikan jumlah anggota', async () => {
    const s = await superadmin();
    await configurePayments(s.token, { uniqueCode: false });
    const solo = await signUp('Sendiri');
    const owner = await signUp('Ramai');
    await setPlan(owner.workspaceId, 'pro'); // batas 10 anggota, cukup untuk 9
    for (let i = 1; i <= 8; i++) {
      const inv = await request(app).post('/api/invites').set(auth(owner.token)).send({ email: `r${i}@test.id`, role: 'member' }).expect(201);
      await signUp(`R${i}`, { email: `r${i}@test.id`, invite: inv.body.token });
    }
    expect(await prisma.users.count({ where: { workspace_id: BigInt(owner.workspaceId) } })).toBe(9);
    const a = (await checkout(solo.token, { plan: 'pro', period: 'monthly' }).expect(201)).body;
    const b = (await checkout(owner.token, { plan: 'pro', period: 'monthly' }).expect(201)).body;
    expect(a.amount).toBe(149_000);
    expect(b.amount).toBe(149_000);
    expect(b.meta).toMatchObject({ flat: true, seats: 9, memberLimit: 10, pricePerMonth: 149_000 });
  });

  it('checkout ditolak bila anggota saat ini melebihi batas paket; paket lebih besar tetap bisa', async () => {
    const s = await superadmin();
    await configurePayments(s.token);
    const owner = await signUp('Pemilik');
    await setPlan(owner.workspaceId, 'bisnis'); // longgarkan batas undangan agar bisa mengisi 11 anggota
    for (let i = 1; i <= 10; i++) {
      const inv = await request(app).post('/api/invites').set(auth(owner.token)).send({ email: `m${i}@test.id`, role: 'member' }).expect(201);
      await signUp(`M${i}`, { email: `m${i}@test.id`, invite: inv.body.token });
    }
    await setPlan(owner.workspaceId, 'gratis');
    const r = await checkout(owner.token, { plan: 'pro', period: 'monthly' }).expect(422);
    expect(r.body.message).toContain('11 anggota');
    expect(r.body.message).toContain('batas paket Pro (10 anggota)');
    expect(r.body).toMatchObject({ memberLimit: 10, members: 11 });
    await checkout(owner.token, { plan: 'bisnis', period: 'monthly' }).expect(201); // batas 30
  });

  it('batas anggota paket ditegakkan setelah dibeli: undangan ke-11 di Pro ditolak, di Bisnis boleh', async () => {
    const owner = await signUp('Pemilik');
    await setPlan(owner.workspaceId, 'pro');
    const invite = (email: string) => request(app).post('/api/invites').set(auth(owner.token)).send({ email, role: 'member' });
    for (let i = 1; i <= 9; i++) await invite(`u${i}@test.id`).expect(201); // 1 pemilik + 9 undangan = 10
    const full = await invite('u10@test.id').expect(402);
    expect(full.body.message).toContain('10 anggota');
    await setPlan(owner.workspaceId, 'bisnis');
    await invite('u10@test.id').expect(201);
  });
});

describe('bukti transfer', () => {
  async function setup() {
    const s = await superadmin();
    await configurePayments(s.token);
    const owner = await signUp('Pemilik');
    const order = (await checkout(owner.token, { plan: 'pro', period: 'monthly' }).expect(201)).body.orderId as string;
    return { s, owner, order };
  }

  it('unggah → status "menunggu verifikasi"; isi berkas diperiksa; hanya pemilik; berkas lama diganti', async () => {
    const { owner, order } = await setup();
    await proof(owner.token, order, Buffer.from('<html><script>alert(1)</script>'), 'bukti.png').expect(422);
    await proof(owner.token, order, PNG, 'bukti.exe').expect(415);
    await proof(owner.token, order, Buffer.alloc(5 * 1024 * 1024 + 10, 0x89), 'besar.png').expect(413);
    await request(app).post(`/api/billing/payments/${order}/proof`).set(auth(owner.token)).expect(422); // tanpa berkas

    const r = await proof(owner.token, order).expect(200);
    expect(r.body).toMatchObject({ status: 'submitted', hasProof: true, proofName: 'bukti.png', meta: { transfer: { method: 'bank', senderName: 'Budi' } } });
    const first = (await prisma.payments.findFirst({ where: { order_id: order } }))!.proof_file!;
    expect(fs.existsSync(path.join(proofDir, first))).toBe(true);

    await proof(owner.token, order, PDF, 'transfer.pdf').expect(200);
    expect(fs.existsSync(path.join(proofDir, first))).toBe(false); // yang lama dihapus
    expect((await billing(owner.token)).body.pending).toMatchObject({ orderId: order, status: 'submitted' });
  });

  it('pegawai non-pemilik dan workspace lain tidak bisa mengunggah/melihat bukti; superadmin bisa', async () => {
    const s = await superadmin();
    await configurePayments(s.token);
    const { owner, member } = await team('admin');
    const stranger = await signUp('Asing');
    const order = (await checkout(owner.token, { plan: 'pro', period: 'monthly' }).expect(201)).body.orderId as string;
    await proof(member.token, order).expect(403);
    await proof(stranger.token, order).expect(404);
    await proof(owner.token, order).expect(200);

    const id = (await prisma.payments.findFirst({ where: { order_id: order } }))!.id;
    await request(app).get(`/api/billing/payments/${order}/proof`).set(auth(owner.token)).expect(200);
    await request(app).get(`/api/billing/payments/${order}/proof`).set(auth(stranger.token)).expect(404);
    const sp = await sys(s.token).get(`/payments/${id}/proof`).expect(200);
    expect(sp.headers['content-type']).toContain('image/png');
    expect(sp.headers['x-content-type-options']).toBe('nosniff');
    expect(sp.headers['content-security-policy']).toContain("default-src 'none'");
    await request(app).get(`/api/system/payments/${id}/proof`).expect(401);
  });

  it('bukti tidak bisa diunggah setelah lunas atau ditolak; berkas ditolak dibersihkan dari disk', async () => {
    const { s, owner, order } = await setup();
    await proof(owner.token, order).expect(200);
    const id = (await prisma.payments.findFirst({ where: { order_id: order } }))!.id;
    await sys(s.token).post(`/payments/${id}/approve`).expect(200);
    const before = fs.readdirSync(proofDir).length;
    await proof(owner.token, order).expect(409);
    expect(fs.readdirSync(proofDir).length).toBe(before); // tidak ada berkas yatim
  });
});

describe('verifikasi superadmin', () => {
  async function submitted(plan: 'pro' | 'bisnis' = 'pro', period: 'monthly' | 'yearly' = 'monthly') {
    const s = await superadmin();
    await configurePayments(s.token);
    const owner = await signUp('Pemilik');
    const order = (await checkout(owner.token, { plan, period }).expect(201)).body.orderId as string;
    await proof(owner.token, order).expect(200);
    const id = (await prisma.payments.findFirst({ where: { order_id: order } }))!.id;
    return { s, owner, order, id };
  }

  it('setuju → paket aktif 1 bulan, rev naik, UI pembeli melihat paket baru; idempoten', async () => {
    const { s, owner, order, id } = await submitted();
    const revBefore = Number((await ws(owner.workspaceId)).rev);
    const r = await sys(s.token).post(`/payments/${id}/approve`, { note: 'Dana masuk BCA' }).expect(200);
    expect(r.body.item).toMatchObject({ status: 'paid', reviewerName: 'Super', reviewNote: 'Dana masuk BCA' });

    const w = await ws(owner.workspaceId);
    expect(w.plan).toBe('pro');
    const days = (w.plan_until!.getTime() - Date.now()) / 864e5;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    expect(Number(w.rev)).toBe(revBefore + 1);
    expect((await billing(owner.token)).body).toMatchObject({ plan: 'pro', trialAvailable: false, pending: null });
    expect((await request(app).get(`/api/billing/payments/${order}`).set(auth(owner.token))).body.status).toBe('paid');

    // klik ganda tidak memperpanjang dua kali
    await sys(s.token).post(`/payments/${id}/approve`).expect(409);
    expect((await ws(owner.workspaceId)).plan_until!.getTime()).toBe(w.plan_until!.getTime());
  });

  it('boleh menyetujui tagihan tanpa bukti (dana terlihat di rekening) dan tagihan yang sempat kedaluwarsa', async () => {
    const s = await superadmin();
    await configurePayments(s.token);
    const a = await signUp();
    const order = (await checkout(a.token, { plan: 'bisnis', period: 'monthly' }).expect(201)).body.orderId as string;
    await prisma.payments.updateMany({ where: { order_id: order }, data: { expires_at: new Date(Date.now() - 1000) } });
    const id = (await prisma.payments.findFirst({ where: { order_id: order } }))!.id;
    await sys(s.token).post(`/payments/${id}/approve`).expect(200);
    expect((await ws(a.workspaceId)).plan).toBe('bisnis');
  });

  it('perpanjangan paket yang sama dihitung dari akhir masa aktif; tahunan = 12 bulan; ganti paket mulai sekarang', async () => {
    const s = await superadmin();
    await configurePayments(s.token);
    const a = await signUp();
    await setPlan(a.workspaceId, 'bisnis', 10);
    const until = (await ws(a.workspaceId)).plan_until!;
    const r = (await checkout(a.token, { plan: 'bisnis', period: 'yearly' }).expect(201)).body;
    expect(r.baseAmount).toBe(3_490_000); // 349.000 × 10 bulan (harga tetap per paket)
    const id = (await prisma.payments.findFirst({ where: { order_id: r.orderId } }))!.id;
    await sys(s.token).post(`/payments/${id}/approve`).expect(200);
    expect((await ws(a.workspaceId)).plan_until!.getTime()).toBe(addMonths(until, 12).getTime());

    // ganti ke Pro: masa aktif baru dihitung dari sekarang (tanpa prorata)
    const r2 = (await checkout(a.token, { plan: 'pro', period: 'monthly' }).expect(201)).body;
    const id2 = (await prisma.payments.findFirst({ where: { order_id: r2.orderId } }))!.id;
    await sys(s.token).post(`/payments/${id2}/approve`).expect(200);
    const w = await ws(a.workspaceId);
    expect(w.plan).toBe('pro');
    expect((w.plan_until!.getTime() - Date.now()) / 864e5).toBeLessThan(32);
  });

  it('tolak wajib beralasan; pembeli melihat alasannya; yang ditolak tidak bisa disetujui; paket tidak berubah', async () => {
    const { s, owner, order, id } = await submitted();
    await sys(s.token).post(`/payments/${id}/reject`, { note: '' }).expect(422);
    await sys(s.token).post(`/payments/${id}/reject`, { note: 'Nominal tidak sesuai' }).expect(200);
    expect((await ws(owner.workspaceId)).plan).toBe('gratis');
    const st = (await request(app).get(`/api/billing/payments/${order}`).set(auth(owner.token))).body;
    expect(st).toMatchObject({ status: 'rejected', reviewNote: 'Nominal tidak sesuai' });
    await sys(s.token).post(`/payments/${id}/approve`).expect(409);
    await sys(s.token).post(`/payments/${id}/reject`, { note: 'lagi' }).expect(409);
    expect((await billing(owner.token)).body.pending).toBeNull();
    await checkout(owner.token, { plan: 'pro', period: 'monthly' }).expect(201); // boleh membuat tagihan baru
    await sys(s.token).post('/payments/999999/approve').expect(404);
    await sys(s.token).post('/payments/abc/approve').expect(404);
  });

  it('dua persetujuan serentak hanya memperpanjang sekali', async () => {
    const { s, owner, id } = await submitted();
    const rs = await Promise.all([1, 2, 3].map(() => sys(s.token).post(`/payments/${id}/approve`)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(2);
    expect((await ws(owner.workspaceId)).plan).toBe('pro');
    expect((((await ws(owner.workspaceId)).plan_until!.getTime() - Date.now()) / 864e5)).toBeLessThan(32);
  });

  it('setelah paket Bisnis disetujui, fitur Bisnis terbuka', async () => {
    const { s, owner, id } = await submitted('bisnis');
    await request(app).post('/api/integrations/ai/breakdown').set(auth(owner.token)).send({ title: 'x' }).expect(402);
    await sys(s.token).post(`/payments/${id}/approve`).expect(200);
    await request(app).post('/api/integrations/ai/breakdown').set(auth(owner.token)).send({ title: 'Desain logo' }).expect(200);
  });
});

describe('daftar, filter, dan laporan', () => {
  async function seed() {
    const s = await superadmin();
    await configurePayments(s.token);
    const mk = async (name: string, plan: 'pro' | 'bisnis', period: 'monthly' | 'yearly', end: 'paid' | 'rejected' | 'submitted' | 'pending') => {
      const u = await signUp(name);
      const o = (await checkout(u.token, { plan, period }).expect(201)).body.orderId as string;
      const id = (await prisma.payments.findFirst({ where: { order_id: o } }))!.id;
      if (end !== 'pending') await proof(u.token, o).expect(200);
      if (end === 'paid') await sys(s.token).post(`/payments/${id}/approve`).expect(200);
      if (end === 'rejected') await sys(s.token).post(`/payments/${id}/reject`, { note: 'salah' }).expect(200);
      return { u, o, id };
    };
    const items = {
      lunasPro: await mk('Alfa', 'pro', 'monthly', 'paid'),
      lunasBisnis: await mk('Beta', 'bisnis', 'yearly', 'paid'),
      ditolak: await mk('Gamma', 'pro', 'monthly', 'rejected'),
      menunggu: await mk('Delta', 'bisnis', 'monthly', 'submitted'),
      belumBayar: await mk('Epsilon', 'pro', 'yearly', 'pending'),
    };
    return { s, items };
  }

  it('daftar memuat ringkasan; filter status/pencarian/tanggal; jumlah menunggu verifikasi', async () => {
    const { s, items } = await seed();
    const all = (await sys(s.token).get('/payments').expect(200)).body;
    expect(all.total).toBe(5);
    expect(all.summary).toMatchObject({ total: 5, paidCount: 2, awaitingReview: 1, pending: 1, rejected: 1, expired: 0 });
    expect(all.awaitingReviewAll).toBe(1);
    const paidAmount = all.items.filter((i: { status: string }) => i.status === 'paid').reduce((n: number, i: { amount: number }) => n + i.amount, 0);
    expect(all.summary.paidAmount).toBe(paidAmount);

    const only = async (q: string) => (await sys(s.token).get(`/payments?${q}`).expect(200)).body;
    expect((await only('status=paid')).total).toBe(2);
    expect((await only('status=submitted')).items[0].orderId).toBe(items.menunggu.o);
    expect((await only('status=pending')).total).toBe(1);
    expect((await only('status=bukan')).total).toBe(5); // nilai tak dikenal diabaikan
    expect((await only('q=Alfa')).items.map((i: { orderId: string }) => i.orderId)).toEqual([items.lunasPro.o]);
    expect((await only(`q=${items.ditolak.o}`)).total).toBe(1);
    expect((await only('from=2000-01-01&to=2000-01-31')).total).toBe(0);
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    expect((await only(`from=${today}&to=${today}`)).total).toBe(5);
    expect((await only(`basis=paid&from=${today}&to=${today}`)).total).toBe(2);
    expect((await only('pageSize=2&page=3')).items).toHaveLength(1);

    await prisma.payments.updateMany({ where: { order_id: items.belumBayar.o }, data: { expires_at: new Date(Date.now() - 1000) } });
    expect((await only('status=expired')).total).toBe(1);
    expect((await only('status=pending')).total).toBe(0);
  });

  it('ekspor CSV: BOM UTF-8, kolom lengkap, filter diterapkan, sel berawalan rumus dinetralkan', async () => {
    const { s, items } = await seed();
    await prisma.workspaces.update({ where: { id: BigInt(items.lunasPro.u.workspaceId) }, data: { name: '=HYPERLINK("http://x")' } });
    const r = await sys(s.token).get('/payments/export?format=csv').expect(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toMatch(/attachment; filename="laporan-pembayaran-\d{4}-\d{2}-\d{2}\.csv"/);
    const text = r.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trim().split('\r\n');
    expect(lines).toHaveLength(6); // judul + 5 transaksi
    expect(lines[0]).toContain('No. Pesanan');
    expect(lines[0]).toContain('Total Tagihan (Rp)');
    expect(text).toContain(items.lunasBisnis.o);
    expect(text).toContain('Lunas');
    expect(text).toContain('Menunggu verifikasi');
    expect(text).toContain("'=HYPERLINK(");
    expect(text).not.toMatch(/(^|,)=HYPERLINK/m);

    const only = (await sys(s.token).get('/payments/export?status=paid').expect(200)).text.slice(1).trim().split('\r\n');
    expect(only).toHaveLength(3);
  });

  it('ekspor Excel: berkas .xlsx sah dengan lembar Pembayaran dan Ringkasan', async () => {
    const { s } = await seed();
    const r = await sys(s.token).get('/payments/export?format=xlsx').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(r.headers['content-type']).toContain('spreadsheetml.sheet');
    const buf = r.body as Buffer;
    expect(buf.subarray(0, 2).toString()).toBe('PK');

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Pembayaran', 'Ringkasan']);
    expect(wb.getWorksheet('Pembayaran')!.rowCount).toBe(6);
    const sum = wb.getWorksheet('Ringkasan')!;
    const text = JSON.stringify(sum.getSheetValues());
    expect(text).toContain('Total pendapatan (lunas)');
    expect(text).toContain('Jumlah transaksi lunas');
  });
});
