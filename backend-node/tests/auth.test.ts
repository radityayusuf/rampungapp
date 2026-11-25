import crypto from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/db';
import { PASSWORD, app, auth, resetDb, signUp } from './helpers';

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const post = (path: string, body: unknown) => request(app).post(path).timeout(4000).send(body as object);
const mail = (n = 1) => `uji${Date.now()}${n}@test.id`;

let EMAIL = '';
let n = 0;
beforeEach(async () => {
  await resetDb();
  EMAIL = `sari${Date.now()}${n++}@test.id`; // unik per tes: penghitung pembatas login hidup selama proses
});

describe('register', () => {
  it('membuat pemilik + workspace dan mengeluarkan token; hanya hash token yang tersimpan', async () => {
    const email = mail();
    const res = await post('/api/auth/register', { name: 'Sari', email, password: PASSWORD }).expect(201);

    expect(res.body.user).toMatchObject({ name: 'Sari', email, role: 'owner', workspace_name: 'Workspace Sari', is_superadmin: false });
    expect(await prisma.api_tokens.count({ where: { token_hash: sha(res.body.token) } })).toBe(1);
    expect(await prisma.api_tokens.count({ where: { token_hash: res.body.token } })).toBe(0);
    const user = await prisma.users.findUnique({ where: { email } });
    expect(user!.password).not.toContain(PASSWORD); // bcrypt, bukan teks asli
    expect(user!.password).toMatch(/^\$2[aby]\$/);
  });

  it('menolak email ganda, termasuk beda huruf besar/kecil', async () => {
    await post('/api/auth/register', { name: 'A', email: 'Dobel@Test.id', password: PASSWORD }).expect(201);
    await post('/api/auth/register', { name: 'B', email: 'dobel@test.id', password: PASSWORD }).expect(422);
  });

  it.each([
    ['sandi pendek', 'abc1'],
    ['tanpa angka', 'hanyahurufsaja'],
    ['tanpa huruf', '1234567890'],
  ])('menolak %s', async (_n, password) => {
    await post('/api/auth/register', { name: 'A', email: mail(), password }).expect(422);
  });

  it.each([
    ['nama kosong', { name: '  ', email: mail(2), password: PASSWORD }],
    ['email tanpa @', { name: 'A', email: 'bukanemail', password: PASSWORD }],
    ['nama bukan string', { name: { a: 1 }, email: mail(3), password: PASSWORD }],
    ['email bukan string', { name: 'A', email: 12345, password: PASSWORD }],
    ['sandi bukan string', { name: 'A', email: mail(4), password: 12345678 }],
    ['nama terlalu panjang (kolom 255)', { name: 'x'.repeat(300), email: mail(5), password: PASSWORD }],
    ['email terlalu panjang', { name: 'A', email: `${'x'.repeat(250)}@test.id`, password: PASSWORD }],
    ['undangan berupa objek (injeksi operator)', { name: 'A', email: mail(6), password: PASSWORD, invite: { not: 'x' } }],
  ])('masukan hostile ditolak 422 tanpa merusak server: %s', async (_n, body) => {
    await post('/api/auth/register', body).expect(422);
  });

  it('JSON rusak dijawab 400, bukan 500', async () => {
    await request(app).post('/api/auth/register').set('Content-Type', 'application/json').timeout(4000).send('{"name": ').expect(400);
  });

  it('pendaftaran serentak dengan email sama: satu berhasil, sisanya ditolak rapi (bukan error 500)', async () => {
    const email = mail(7);
    const res = await Promise.all(Array.from({ length: 4 }, () => post('/api/auth/register', { name: 'Kembar', email, password: PASSWORD })));
    const codes = res.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.every((c) => c === 201 || c === 422)).toBe(true);
  });
});

describe('login', () => {
  it('berhasil (email tidak peka huruf besar/kecil) dan pesan gagal sama untuk akun tidak ada', async () => {
    const a = await signUp('Sari', { email: EMAIL });
    await post('/api/auth/login', { email: EMAIL.toUpperCase(), password: PASSWORD }).expect(200).then((r) => expect(r.body.user.id).toBe(a.id));

    const wrong = await post('/api/auth/login', { email: EMAIL, password: 'salah12345' }).expect(422);
    const ghost = await post('/api/auth/login', { email: 'tidakada@test.id', password: 'salah12345' }).expect(422);
    expect(ghost.body.message).toBe(wrong.body.message); // tidak membocorkan akun mana yang ada
  });

  it.each([
    ['email bukan string', { email: 123, password: PASSWORD }],
    ['email objek', { email: { a: 1 }, password: PASSWORD }],
    ['sandi bukan string', { email: 'a@test.id', password: { a: 1 } }],
    ['tanpa body', {}],
  ])('masukan hostile ditolak tanpa merusak server: %s', async (_n, body) => {
    const r = await post('/api/auth/login', body);
    expect([422, 429]).toContain(r.status);
  });

  it('akun dibatasi 5 kali gagal per menit; email lain tidak terpengaruh', async () => {
    await signUp('Sari', { email: EMAIL });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await post('/api/auth/login', { email: EMAIL, password: 'salah12345' })).status);
    expect(codes.slice(0, 5).every((c) => c === 422)).toBe(true);
    expect(codes[5]).toBe(429);
    await post('/api/auth/login', { email: 'lain@test.id', password: 'salah12345' }).expect(422);
  });
});

describe('sesi: me, ubah nama, logout, kedaluwarsa', () => {
  it('me butuh token; ubah nama divalidasi', async () => {
    const a = await signUp('Sari');
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer salah').expect(401);
    await request(app).get('/api/auth/me').set(auth(a.token)).expect(200);

    await request(app).patch('/api/auth/me').set(auth(a.token)).send({ name: 'Nama Baru' }).expect(200).then((r) => expect(r.body.user.name).toBe('Nama Baru'));
    for (const name of ['', '   ', 123, { a: 1 }, 'x'.repeat(300)]) {
      await request(app).patch('/api/auth/me').set(auth(a.token)).timeout(4000).send({ name }).expect(422);
    }
  });

  it('logout hanya mencabut token perangkat itu; perangkat lain tetap masuk', async () => {
    const a = await signUp('Sari', { email: EMAIL });
    const b = (await post('/api/auth/login', { email: EMAIL, password: PASSWORD }).expect(200)).body.token as string;

    await request(app).post('/api/auth/logout').set(auth(a.token)).expect(200);
    await request(app).get('/api/auth/me').set(auth(a.token)).expect(401);
    await request(app).get('/api/auth/me').set(auth(b)).expect(200);
  });

  it('token perangkat kedaluwarsa setelah 30 hari tidak dipakai; token API pribadi tidak', async () => {
    const a = await signUp('Sari');
    const personal = (await request(app).post('/api/tokens').set(auth(a.token)).send({ name: 'Skrip' }).expect(201)).body.token as string;
    const old = new Date(Date.now() - 31 * 864e5);
    await prisma.api_tokens.updateMany({ data: { last_used_at: old, created_at: old } });

    await request(app).get('/api/auth/me').set(auth(a.token)).expect(401);
    expect(await prisma.api_tokens.count({ where: { name: null } })).toBe(0); // dibersihkan
    await request(app).get('/api/auth/me').set(auth(personal)).expect(200); // token pribadi tetap hidup
  });
});

describe('lupa & atur ulang kata sandi', () => {
  const requestReset = async (email: string, plain = 'tokenujicoba1234567890abcdef') => {
    await post('/api/auth/forgot', { email }).expect(200);
    await prisma.password_reset_tokens.update({ where: { email }, data: { token: sha(plain) } });
    return plain;
  };

  it('forgot menjawab sama untuk email terdaftar maupun tidak, dan hanya menyimpan hash', async () => {
    await signUp('Sari', { email: EMAIL });
    const known = await post('/api/auth/forgot', { email: EMAIL }).expect(200);
    const unknown = await post('/api/auth/forgot', { email: 'hantu@test.id' }).expect(200);
    expect(known.body).toEqual(unknown.body);
    expect(await prisma.password_reset_tokens.count()).toBe(1);
    const row = await prisma.password_reset_tokens.findUnique({ where: { email: EMAIL } });
    expect(row!.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([[123], [{ a: 1 }], [null], [undefined]])('forgot dengan email hostile (%j) tidak merusak server', async (email) => {
    const r = await post('/api/auth/forgot', { email });
    expect(r.status).toBeLessThan(500);
  });

  it('alur lengkap: sandi baru berlaku, sandi lama tidak, sesi perangkat dicabut, token sekali pakai', async () => {
    const a = await signUp('Sari', { email: EMAIL });
    const personal = (await request(app).post('/api/tokens').set(auth(a.token)).send({ name: 'Skrip' }).expect(201)).body.token as string;
    const plain = await requestReset(EMAIL);

    const res = await post('/api/auth/reset', { email: EMAIL, token: plain, password: 'baruSekali9' }).expect(200);
    expect(res.body.token).toBeTruthy();

    await post('/api/auth/login', { email: EMAIL, password: 'baruSekali9' }).expect(200);
    await post('/api/auth/login', { email: EMAIL, password: PASSWORD }).expect(422);
    await request(app).get('/api/auth/me').set(auth(a.token)).expect(401); // sesi lama dicabut
    await request(app).get('/api/auth/me').set(auth(personal)).expect(200); // token API pribadi tetap
    await post('/api/auth/reset', { email: EMAIL, token: plain, password: 'lainLagi123' }).expect(422); // sekali pakai
  });

  it('menolak token salah, kedaluwarsa (>60 menit), sandi lemah, dan data hostile', async () => {
    await signUp('Sari', { email: EMAIL });
    const plain = await requestReset(EMAIL);

    await post('/api/auth/reset', { email: EMAIL, token: 'salah', password: 'baruSekali9' }).expect(422);
    await post('/api/auth/reset', { email: EMAIL, token: plain, password: 'lemah' }).expect(422);
    for (const body of [{ email: 123, token: plain, password: 'baruSekali9' }, { email: EMAIL, token: { a: 1 }, password: 'baruSekali9' }]) {
      expect((await post('/api/auth/reset', body)).status).toBeLessThan(500);
    }

    await prisma.password_reset_tokens.update({ where: { email: EMAIL }, data: { created_at: new Date(Date.now() - 61 * 60_000) } });
    await post('/api/auth/reset', { email: EMAIL, token: plain, password: 'baruSekali9' }).expect(422);
  });
});

describe('login Google (integrasi dengan database)', () => {
  const CLIENT = 'test-client.apps.googleusercontent.com';
  const token = 'g'.repeat(60);
  const googleInfo = (email: string, over: Record<string, string> = {}) => ({
    aud: CLIENT, iss: 'https://accounts.google.com', email, email_verified: 'true', name: 'Dewi G', exp: String(Math.floor(Date.now() / 1000) + 600), ...over,
  });
  const mockGoogle = (info: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => info }));
  afterEach(() => vi.unstubAllGlobals());

  it('akun baru: dibuat sebagai pemilik terverifikasi; panggilan kedua masuk ke akun yang sama', async () => {
    mockGoogle(googleInfo('dewi@gmail.com'));
    const first = await post('/api/auth/google', { credential: token }).expect(200);
    expect(first.body.user).toMatchObject({ email: 'dewi@gmail.com', role: 'owner' });
    expect((await prisma.users.findUnique({ where: { email: 'dewi@gmail.com' } }))!.email_verified_at).not.toBeNull();

    const second = await post('/api/auth/google', { credential: token }).expect(200);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(await prisma.users.count()).toBe(1);
  });

  it('menolak token dengan audience salah, email belum terverifikasi, atau Google menolak', async () => {
    mockGoogle(googleInfo('dewi@gmail.com', { aud: 'aplikasi-lain' }));
    await post('/api/auth/google', { credential: token }).expect(401);
    mockGoogle(googleInfo('dewi@gmail.com', { email_verified: 'false' }));
    await post('/api/auth/google', { credential: token }).expect(401);
    mockGoogle({ error: 'invalid_token' }, false);
    await post('/api/auth/google', { credential: token }).expect(401);
    expect(await prisma.users.count()).toBe(0);
  });

  it('pra-pembajakan: akun email+sandi yang belum terverifikasi dinetralkan saat pemilik asli masuk lewat Google', async () => {
    const attacker = await signUp('Penyerang', { email: 'korban@gmail.com' });
    mockGoogle(googleInfo('korban@gmail.com'));
    await post('/api/auth/google', { credential: token }).expect(200);

    await post('/api/auth/login', { email: 'korban@gmail.com', password: PASSWORD }).expect(422); // sandi penyerang tak berlaku
    await request(app).get('/api/auth/me').set(auth(attacker.token)).expect(401); // sesi penyerang dicabut
  });

  it('lewat undangan: email harus cocok, lalu bergabung ke workspace pengundang', async () => {
    const owner = await signUp('Pemilik');
    const inv = (await request(app).post('/api/invites').set(auth(owner.token)).send({ email: 'tamu@gmail.com', role: 'admin' }).expect(201)).body.token as string;

    mockGoogle(googleInfo('orang.lain@gmail.com'));
    await post('/api/auth/google', { credential: token, invite: inv }).expect(422);
    mockGoogle(googleInfo('tamu@gmail.com'));
    const ok = await post('/api/auth/google', { credential: token, invite: inv }).expect(200);
    expect(ok.body.user).toMatchObject({ role: 'admin', workspace_id: owner.workspaceId });
    await post('/api/auth/google', { credential: token, invite: { not: 'x' } }).expect(200); // akun sudah ada: objek diabaikan, tak ada injeksi
  });
});
