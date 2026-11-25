import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, auth, push, resetDb, signUp, useDefaultPlan } from './helpers';

beforeEach(resetDb);

const UPLOAD_DIR = path.resolve(__dirname, '../uploads');
const created: string[] = [];
afterAll(() => {
  for (const f of created) fs.rmSync(path.join(UPLOAD_DIR, f), { force: true });
});

// ───────────────────────── Portal klien ─────────────────────────
describe('portal klien (publik)', () => {
  beforeEach(() => useDefaultPlan('bisnis'));
  afterEach(() => useDefaultPlan('gratis'));
  const TOKEN = 'abcDEF1234567890abcdWXYZ';

  async function seed(enabled = true, token = TOKEN) {
    const owner = await signUp('Pemilik');
    await push(owner.token, [
      { c: 'projects', id: 'p1', data: { id: 'p1', name: 'Website Klien', description: 'Deskripsi publik', clientPortalEnabled: enabled, portalToken: token, clientId: 'c1', budget: 99000000, startDate: '2026-11-01', dueDate: '2026-12-01' } },
      { c: 'clients', id: 'c1', data: { id: 'c1', company: 'PT Klien', email: 'rahasia@klien.id', phone: '0812' } },
      { c: 'members', id: owner.me, data: { id: owner.me, name: 'Sari', email: 'sari@internal.id' } },
      { c: 'tasks', id: 't1', data: { id: 't1', projectId: 'p1', title: 'Desain', status: 'done', assigneeId: owner.me, description: 'catatan internal', subtasks: [{ completed: true }, { completed: false }] } },
      { c: 'tasks', id: 't2', data: { id: 't2', projectId: 'lain', title: 'Proyek lain' } },
      { c: 'invoices', id: 'i1', data: { id: 'i1', total: 5000000 } },
    ]).expect(200);
    return owner;
  }

  it('menampilkan ringkasan proyek tanpa membocorkan data internal', async () => {
    await seed();
    const res = await request(app).get(`/api/portal/${TOKEN}`).expect(200);

    expect(res.body).toMatchObject({ workspace: 'Workspace Pemilik', client: 'PT Klien', project: { name: 'Website Klien' } });
    expect(res.body.tasks).toEqual([{ title: 'Desain', status: 'done', dueDate: null, assignee: 'Sari', subtasks: 2, subtasksDone: 1 }]);

    const body = res.text;
    for (const secret of ['catatan internal', '99000000', 'Proyek lain', 'rahasia@klien.id', 'sari@internal.id', 'i1', '0812']) {
      expect(body).not.toContain(secret);
    }
  });

  it('mengikuti perubahan: proyek yang portalnya dimatikan langsung tidak bisa dibuka', async () => {
    const owner = await seed();
    await request(app).get(`/api/portal/${TOKEN}`).expect(200);
    await push(owner.token, [{ c: 'projects', id: 'p1', data: { id: 'p1', name: 'X', clientPortalEnabled: false, portalToken: TOKEN } }]).expect(200);
    await request(app).get(`/api/portal/${TOKEN}`).expect(404);
  });

  it.each([
    ['token tidak ada', 'zzzzzzzzzzzzzzzzzzzzzzzz'],
    ['terlalu pendek', 'pendek'],
    ['karakter LIKE/SQL', encodeURIComponent('%"portalToken"%')],
    ['mengandung titik', 'abcDEF1234567890.abcd'],
    ['terlalu panjang', 'a'.repeat(65)],
  ])('menolak: %s', async (_n, bad) => {
    await seed();
    await request(app).get(`/api/portal/${bad}`).expect(404);
  });

  it('proyek yang belum mengaktifkan portal tidak terbuka walau token cocok', async () => {
    await seed(false);
    await request(app).get(`/api/portal/${TOKEN}`).expect(404);
  });
});

// ───────────────────────── Upload ─────────────────────────
describe('upload berkas', () => {
  const upload = (token: string, name: string, content: string | Buffer = 'isi') =>
    request(app).post('/api/upload').set(auth(token)).timeout(10000).attach('file', Buffer.from(content), name);

  it('wajib login', async () => {
    await request(app).post('/api/upload').attach('file', Buffer.from('x'), 'a.txt').expect(401);
  });

  it('menerima tipe aman dengan nama acak; catatan terhubung ke workspace; unduhan memakai header aman', async () => {
    const a = await signUp('Sari');
    const res = await upload(a.token, 'laporan.txt', 'halo rampung').expect(201);
    created.push(res.body.storedName);

    expect(res.body).toMatchObject({ name: 'laporan.txt', size: 12 });
    expect(res.body.storedName).toMatch(/^[0-9a-f]{32}\.txt$/);
    const rec = await prisma.uploads.findFirst({ where: { stored_name: res.body.storedName } });
    expect(Number(rec!.workspace_id)).toBe(a.workspaceId);

    const dl = await request(app).get(res.body.url).expect(200);
    expect(dl.text).toBe('halo rampung');
    expect(dl.headers['content-disposition']).toBe('attachment');
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect(dl.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('gambar dan PDF boleh tampil inline', async () => {
    const a = await signUp('Sari');
    const res = await upload(a.token, 'foto.PNG', 'png').expect(201); // ekstensi tidak peka huruf besar/kecil
    created.push(res.body.storedName);
    expect(res.body.storedName.endsWith('.png')).toBe(true);
    expect((await request(app).get(res.body.url).expect(200)).headers['content-disposition']).toBe('inline');
  });

  it.each(['x.html', 'x.HTML', 'x.svg', 'x.js', 'x.exe', 'x.php', 'x.htm', 'x', 'x.png.html'])('menolak tipe berbahaya: %s', async (name) => {
    const a = await signUp('Sari');
    await upload(a.token, name, '<script>alert(1)</script>').expect(415);
  });

  it('tanpa berkas dijawab 422; berkas terlalu besar (>25 MB) dijawab 413', async () => {
    const a = await signUp('Sari');
    await request(app).post('/api/upload').set(auth(a.token)).expect(422);
    await upload(a.token, 'besar.zip', Buffer.alloc(26 * 1024 * 1024)).expect(413);
  });

  it.each(['..%2F..%2Fpackage.json', '..%5C..%5Cpackage.json', '%2e%2e%2fpackage.json', 'tidak-ada.txt'])('unduhan tidak bisa keluar dari folder upload: %s', async (name) => {
    await request(app).get(`/api/uploads/${name}`).expect(404);
  });
});

// ───────────────────────── Panel sistem ─────────────────────────
describe('panel Administrator Sistem', () => {
  async function makeSuper() {
    const s = await signUp('Super');
    await prisma.users.update({ where: { id: BigInt(s.id) }, data: { role: 'superadmin' } });
    return s;
  }
  const get = (p: string, t?: string) => (t ? request(app).get(p).set(auth(t)) : request(app).get(p)).timeout(4000);

  it('hanya superadmin; tanpa token 401, akun biasa 403 (termasuk pemilik workspace)', async () => {
    const owner = await signUp('Pemilik');
    for (const p of ['/api/system/stats', '/api/system/workspaces', '/api/system/users']) {
      await get(p).expect(401);
      await get(p, owner.token).expect(403);
    }
    await request(app).delete('/api/system/users/1').set(auth(owner.token)).expect(403);
    await request(app).patch('/api/system/users/1/role').set(auth(owner.token)).send({ role: 'superadmin' }).expect(403);
  });

  it('akun biasa tidak bisa menaikkan perannya sendiri lewat endpoint lain', async () => {
    const owner = await signUp('Pemilik');
    await request(app).patch(`/api/members/${owner.id}`).set(auth(owner.token)).send({ role: 'superadmin' }).expect(422);
    await request(app).patch('/api/auth/me').set(auth(owner.token)).send({ name: 'X', role: 'superadmin' }).expect(200);
    expect((await prisma.users.findUnique({ where: { id: BigInt(owner.id) } }))!.role).toBe('owner');
  });

  it('superadmin melihat statistik, workspace, dan pengguna tanpa hash kata sandi', async () => {
    const s = await makeSuper();
    await signUp('Biasa');

    const stats = (await get('/api/system/stats', s.token).expect(200)).body;
    expect(stats).toMatchObject({ totalUsers: 2, totalWorkspaces: 2 });
    // Nilai diukur, bukan teks tetap: versi MySQL asli, latensi angka, dan WebSocket jujur (server uji tidak menjalankan Socket.io).
    expect(stats.database).toMatch(/^MySQL \d+\.\d+/);
    expect(stats.database).not.toContain('Connected');
    expect(typeof stats.dbLatencyMs).toBe('number');
    expect(stats.websocket).toBe('Tidak aktif');
    expect((await get('/api/system/workspaces', s.token).expect(200)).body.workspaces).toHaveLength(2);

    const users = await get('/api/system/users', s.token).expect(200);
    expect(users.body.users).toHaveLength(2);
    expect(users.text).not.toMatch(/\$2[aby]\$/); // tidak ada hash bcrypt
    expect(users.text).not.toContain('password');
  });

  it('hapus pengguna: tidak bisa diri sendiri; id tak ada/invalid = 4xx; berhasil mencabut sesinya', async () => {
    const s = await makeSuper();
    const v = await signUp('Korban');
    const del = (id: string | number) => request(app).delete(`/api/system/users/${id}`).set(auth(s.token)).timeout(4000);

    await del(s.id).expect(422);
    for (const bad of ['abc', '0', '999999', '99999999999999999999999']) {
      const r = await del(bad);
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
    }
    await del(v.id).expect(200);
    await request(app).get('/api/auth/me').set(auth(v.token)).expect(401);
    expect(await prisma.users.count()).toBe(1);
  });

  it('ubah peran: hanya nilai yang dikenal; id invalid/tak ada = 4xx', async () => {
    const s = await makeSuper();
    const v = await signUp('Target');
    const set = (id: string | number, role: unknown) => request(app).patch(`/api/system/users/${id}/role`).set(auth(s.token)).timeout(4000).send({ role });

    await set(v.id, 'admin').expect(200);
    expect((await prisma.users.findUnique({ where: { id: BigInt(v.id) } }))!.role).toBe('admin');
    for (const role of ['dewa', '', 123, null, { a: 1 }]) await set(v.id, role).expect(422);
    for (const bad of ['abc', '999999', '99999999999999999999999']) {
      const r = await set(bad, 'member');
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
    }
  });
});
