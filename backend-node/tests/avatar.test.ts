import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, auth, pull, push, resetDb, signUp, team } from './helpers';

beforeEach(resetDb);

const dir = path.join(__dirname, '../uploads/avatars');
const mine = (id: number) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith(`u${id}-`)) : []);
const made: number[] = [];
afterAll(() => { for (const id of made) for (const f of mine(id)) fs.rmSync(path.join(dir, f), { force: true }); });

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const upload = (token: string, buf: Buffer, name = 'foto.jpg') => request(app).post('/api/auth/me/avatar').set(auth(token)).attach('avatar', buf, name);

describe('foto profil', () => {
  it('unggah, tampil publik, ganti (yang lama terhapus), lalu hapus', async () => {
    const a = await signUp();
    made.push(a.id);
    const r1 = await upload(a.token, JPEG).expect(201);
    expect(r1.body.url).toMatch(new RegExp(`^/avatars/u${a.id}-[a-f0-9]{24}\\.jpg$`));
    const got = await request(app).get('/api' + r1.body.url).expect(200);
    expect(got.headers['content-type']).toBe('image/jpeg');
    expect(got.headers['cache-control']).toContain('immutable');

    const r2 = await upload(a.token, PNG, 'x.png').expect(201);
    expect(r2.body.url).toMatch(/\.png$/);
    expect(mine(a.id)).toHaveLength(1);
    await request(app).get('/api' + r1.body.url).expect(404);

    await request(app).delete('/api/auth/me/avatar').set(auth(a.token)).expect(200);
    expect(mine(a.id)).toHaveLength(0);
  });

  it('hanya gambar sungguhan; nama/tipe palsu ditolak; batas 2 MB; wajib masuk', async () => {
    const a = await signUp();
    made.push(a.id);
    await upload(a.token, Buffer.from('<svg onload="alert(1)"></svg>'), 'foto.jpg').expect(422);
    await upload(a.token, Buffer.from('<html><script>x</script></html>'), 'x.png').expect(422);
    await upload(a.token, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2 * 1024 * 1024 + 10)])).expect(413);
    await request(app).post('/api/auth/me/avatar').attach('avatar', JPEG, 'a.jpg').expect(401);
    expect(mine(a.id)).toHaveLength(0);
  });

  it('tidak bisa menghapus atau menimpa foto orang lain; nama berkas aneh tidak dilayani', async () => {
    const { owner, member } = await team();
    made.push(owner.id, member.id);
    const { url } = (await upload(owner.token, JPEG).expect(201)).body;
    await upload(member.token, JPEG).expect(201);
    await request(app).delete('/api/auth/me/avatar').set(auth(member.token)).expect(200);
    expect(mine(owner.id)).toHaveLength(1);
    await request(app).get('/api' + url).expect(200);
    for (const bad of ['..%2F..%2F.env', 'u1-zz.jpg', 'u1-0123456789abcdef01234567.svg']) await request(app).get('/api/avatars/' + bad).expect(404);
  });

  it('catatan anggota hanya boleh menunjuk foto miliknya sendiri', async () => {
    const { owner, member } = await team();
    made.push(owner.id, member.id);
    const { url } = (await upload(member.token, JPEG).expect(201)).body;
    const rec = (id: string, avatarUrl: unknown) => [{ c: 'members', id, data: { id, name: 'X', avatarUrl } }];
    await push(member.token, rec(member.me, url)).expect(200);
    expect((await pull(owner.token)).body.collections.members.find((m: { id: string }) => m.id === member.me).avatarUrl).toBe(url);
    await push(member.token, rec(member.me, 'https://pelacak.example/x.gif')).expect(422);
    await push(member.token, rec(member.me, url.replace(`u${member.id}-`, `u${owner.id}-`))).expect(422);
    await push(owner.token, rec(owner.me, url)).expect(422); // milik orang lain
    await push(member.token, rec(member.me, null)).expect(200); // hapus foto
  });
});
