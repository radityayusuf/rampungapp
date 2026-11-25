import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, auth, resetDb, signUp, team } from './helpers';

beforeEach(resetDb);

const get = (path: string, token: string) => request(app).get(path).set(auth(token)).timeout(4000);
const post = (path: string, token: string, body: object = {}) => request(app).post(path).set(auth(token)).timeout(4000).send(body);
const patch = (path: string, token: string, body: object = {}) => request(app).patch(path).set(auth(token)).timeout(4000).send(body);
const del = (path: string, token: string) => request(app).delete(path).set(auth(token)).timeout(4000);

describe('anggota', () => {
  it('daftar anggota hanya milik workspace sendiri dan tidak membocorkan kata sandi', async () => {
    const { owner } = await team();
    await signUp('Orang Lain');
    const res = await get('/api/members', owner.token).expect(200);

    expect(res.body.members).toHaveLength(2);
    for (const m of res.body.members) expect(Object.keys(m).sort()).toEqual(['email', 'id', 'name', 'role']);
  });

  it('hanya pemilik yang boleh mengubah peran; pemilik tidak bisa diubah; lintas workspace = 404', async () => {
    const { owner, member } = await team();
    const stranger = await signUp('Asing');

    await patch(`/api/members/${member.id}`, member.token, { role: 'admin' }).expect(403);
    await patch(`/api/members/${member.id}`, owner.token, { role: 'owner' }).expect(422);
    await patch(`/api/members/${member.id}`, owner.token, { role: 'admin' }).expect(200);
    expect((await prisma.users.findUnique({ where: { id: BigInt(member.id) } }))!.role).toBe('admin');
    await patch(`/api/members/${owner.id}`, owner.token, { role: 'member' }).expect(422);
    await patch(`/api/members/${stranger.id}`, owner.token, { role: 'member' }).expect(404); // bukan anggotanya
  });

  it('admin tidak boleh mengubah peran, tetapi boleh mengeluarkan anggota', async () => {
    const { owner, member: admin } = await team('admin');
    const m2 = await (async () => {
      const email = `m2${Date.now()}@test.id`;
      const inv = (await post('/api/invites', owner.token, { email, role: 'member' }).expect(201)).body.token;
      return signUp('Dua', { email, invite: inv });
    })();

    await patch(`/api/members/${m2.id}`, admin.token, { role: 'admin' }).expect(403);
    await del(`/api/members/${m2.id}`, admin.token).expect(200);
  });

  it('mengeluarkan anggota: sesinya dicabut dan ia dapat workspace pribadi yang bersih', async () => {
    const { owner, member } = await team();
    await request(app).post('/api/sync').set(auth(owner.token)).send({ changes: [{ c: 'tasks', id: 't1', data: { id: 't1' } }] }).expect(200);

    await del(`/api/members/${member.id}`, owner.token).expect(200);
    await get('/api/sync', member.token).expect(401);
    const u = await prisma.users.findUnique({ where: { id: BigInt(member.id) } });
    expect(Number(u!.workspace_id)).not.toBe(owner.workspaceId);
    expect(u!.role).toBe('owner');
  });

  it('tidak bisa mengeluarkan pemilik, diri sendiri, anggota workspace lain; anggota biasa ditolak', async () => {
    const { owner, member } = await team();
    const stranger = await signUp('Asing');

    await del(`/api/members/${owner.id}`, owner.token).expect(422);
    await del(`/api/members/${stranger.id}`, owner.token).expect(404);
    await del(`/api/members/${owner.id}`, member.token).expect(403);
  });

  it.each(['abc', '-1', '0', '99999999999999999999999', '1e3', '%00'])('id anggota tidak valid (%s) dijawab 4xx, tidak 500/crash', async (bad) => {
    const { owner } = await team();
    for (const r of [await patch(`/api/members/${bad}`, owner.token, { role: 'admin' }), await del(`/api/members/${bad}`, owner.token)]) {
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
    }
  });
});

describe('undangan', () => {
  it('admin/pemilik membuat undangan; anggota biasa ditolak; emailed jujur (tanpa SMTP = false)', async () => {
    const { owner, member } = await team();
    const res = await post('/api/invites', owner.token, { email: 'Baru@Test.id', role: 'member' }).expect(201);
    expect(res.body).toMatchObject({ email: 'baru@test.id', role: 'member', emailed: false });
    expect(res.body.token).toHaveLength(32);

    await post('/api/invites', member.token, { email: 'x@test.id', role: 'member' }).expect(403);
    await get('/api/invites', member.token).expect(403);
  });

  it.each([
    ['email tanpa @', { email: 'abc', role: 'member' }],
    ['peran owner', { email: 'a@test.id', role: 'owner' }],
    ['peran superadmin', { email: 'a@test.id', role: 'superadmin' }],
    ['email bukan string', { email: 123, role: 'member' }],
    ['email objek', { email: { a: 1 }, role: 'member' }],
    ['email terlalu panjang', { email: `${'x'.repeat(200)}@test.id`, role: 'member' }],
  ])('validasi: %s ditolak 4xx', async (_n, body) => {
    const { owner } = await team();
    const r = await post('/api/invites', owner.token, body);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });

  it('email yang sudah punya akun ditolak; undangan ulang menggantikan yang lama', async () => {
    const { owner } = await team();
    await signUp('Ada', { email: 'ada@test.id' });
    await post('/api/invites', owner.token, { email: 'ada@test.id', role: 'member' }).expect(422);

    const first = (await post('/api/invites', owner.token, { email: 'baru@test.id', role: 'member' }).expect(201)).body.token;
    const second = (await post('/api/invites', owner.token, { email: 'baru@test.id', role: 'admin' }).expect(201)).body.token;
    expect(second).not.toBe(first);
    await request(app).get(`/api/invites/${first}`).expect(404);
    await request(app).get(`/api/invites/${second}`).expect(200);
    expect(await prisma.invites.count({ where: { email: 'baru@test.id' } })).toBe(1);
  });

  it('info undangan publik hanya memuat email, peran, nama workspace', async () => {
    const { owner } = await team();
    const t = (await post('/api/invites', owner.token, { email: 'baru@test.id', role: 'member' }).expect(201)).body.token;
    const res = await request(app).get(`/api/invites/${t}`).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['email', 'role', 'workspace_name']);
    await request(app).get('/api/invites/tidakada').expect(404);
  });

  it('bergabung: email harus cocok dan undangan sekali pakai', async () => {
    const owner = await signUp('Pemilik');
    const t = (await post('/api/invites', owner.token, { email: 'tamu@test.id', role: 'member' }).expect(201)).body.token;

    await request(app).post('/api/auth/register').send({ name: 'X', email: 'lain@test.id', password: 'rahasia123', invite: t }).expect(422);
    await request(app).post('/api/auth/register').send({ name: 'Tamu', email: 'tamu@test.id', password: 'rahasia123', invite: t }).expect(201);
    await request(app).post('/api/auth/register').send({ name: 'Y', email: 'y@test.id', password: 'rahasia123', invite: t }).expect(422);
  });

  it('daftar undangan dan pembatalan terbatas pada workspace sendiri', async () => {
    const a = await signUp('A');
    const b = await signUp('B');
    await post('/api/invites', a.token, { email: 'x@test.id', role: 'member' }).expect(201);
    const mine = (await get('/api/invites', a.token).expect(200)).body.invites;
    expect(mine).toHaveLength(1);
    expect((await get('/api/invites', b.token).expect(200)).body.invites).toHaveLength(0);

    await del(`/api/invites/${mine[0].id}`, b.token).expect(200); // pura-pura sukses, tetapi tidak menghapus milik A
    expect(await prisma.invites.count()).toBe(1);
    await del(`/api/invites/${mine[0].id}`, a.token).expect(200);
    expect(await prisma.invites.count()).toBe(0);
    for (const bad of ['abc', '-5', '99999999999999999999999']) expect((await del(`/api/invites/${bad}`, a.token)).status).toBeLessThan(500);
  });
});

describe('token API pribadi', () => {
  it('dibuat, dipakai, hanya hash tersimpan, dihapus', async () => {
    const a = await signUp('Sari');
    const res = await post('/api/tokens', a.token, { name: '  Skrip  ' }).expect(201);
    expect(res.body.token).toMatch(/^rmp_[A-Za-z0-9]{40}$/);

    await get('/api/sync/rev', res.body.token).expect(200);
    const list = (await get('/api/tokens', a.token).expect(200)).body.tokens;
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Skrip');
    expect(JSON.stringify(list)).not.toContain(res.body.token);

    await del(`/api/tokens/${list[0].id}`, a.token).expect(200);
    await get('/api/sync/rev', res.body.token).expect(401);
  });

  it('tidak bisa menghapus/melihat token milik pengguna lain; maksimal 10; nama divalidasi', async () => {
    const a = await signUp('A');
    const b = await signUp('B');
    const tk = (await post('/api/tokens', a.token, { name: 'milik A' }).expect(201)).body.token as string;
    const id = (await get('/api/tokens', a.token).expect(200)).body.tokens[0].id;

    await del(`/api/tokens/${id}`, b.token).expect(200);
    await get('/api/sync/rev', tk).expect(200); // tetap hidup
    expect((await get('/api/tokens', b.token).expect(200)).body.tokens).toHaveLength(0);

    for (let i = 0; i < 9; i++) await post('/api/tokens', a.token, { name: `t${i}` }).expect(201);
    await post('/api/tokens', a.token, { name: 'ke-11' }).expect(422);
    for (const name of ['', '   ', 123, { a: 1 }]) await post('/api/tokens', b.token, { name }).expect(422);
  });

  it.each(['abc', '-1', '99999999999999999999999'])('hapus token dengan id tidak valid (%s) tidak membuat server error', async (bad) => {
    const a = await signUp('A');
    expect((await del(`/api/tokens/${bad}`, a.token)).status).toBeLessThan(500);
  });
});
