import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, auth, pull, push, resetDb, signUp, task, team } from './helpers';

beforeEach(resetDb);

describe('sinkronisasi: dasar', () => {
  it('push, pull, ubah, hapus, dan nomor rev bertambah satu per push', async () => {
    const a = await signUp();

    const first = await pull(a.token).expect(200);
    expect(first.body).toMatchObject({ empty: true, rev: 0 });

    await push(a.token, [task('t1', 'Halo Ä 日本')]).expect(200).then((r) => expect(r.body).toMatchObject({ rev: 1, prev: 0 }));
    await push(a.token, [task('t1', 'Diubah')]).expect(200).then((r) => expect(r.body).toMatchObject({ rev: 2, prev: 1 }));

    const got = await pull(a.token).expect(200);
    expect(got.body.rev).toBe(2);
    expect(got.body.collections.tasks).toEqual([{ id: 't1', title: 'Diubah', projectId: 'p1' }]);

    await push(a.token, [{ c: 'tasks', id: 't1', data: null }]).expect(200);
    expect((await pull(a.token)).body.collections.tasks).toEqual([]);
    expect((await request(app).get('/api/sync/rev').set(auth(a.token))).body.rev).toBe(3);
  });

  it('teks Unicode dan tanda kutip tersimpan utuh', async () => {
    const a = await signUp();
    const title = 'Rapat "tim" — Dewi\'s 日本 ü';
    await push(a.token, [task('u1', title)]).expect(200);
    expect((await pull(a.token)).body.collections.tasks[0].title).toBe(title);
  });

  it('push tanpa token ditolak 401', async () => {
    await request(app).get('/api/sync').expect(401);
    await request(app).post('/api/sync').send({ changes: [] }).expect(401);
  });
});

describe('sinkronisasi: isolasi antar workspace', () => {
  it('workspace lain tidak melihat dan tidak bisa menimpa data', async () => {
    const a = await signUp('A');
    const b = await signUp('B');

    await push(a.token, [task('rahasia', 'Milik A')]).expect(200);
    expect((await pull(b.token)).body.empty).toBe(true);

    // B menulis id yang sama: tidak menimpa milik A.
    await push(b.token, [task('rahasia', 'Milik B')]).expect(200);
    expect((await pull(a.token)).body.collections.tasks[0].title).toBe('Milik A');
    expect((await pull(b.token)).body.collections.tasks[0].title).toBe('Milik B');

    // B menghapus id yang sama: milik A tetap ada.
    await push(b.token, [{ c: 'tasks', id: 'rahasia', data: null }]).expect(200);
    expect((await pull(a.token)).body.collections.tasks).toHaveLength(1);
  });
});

describe('sinkronisasi: validasi masukan', () => {
  it.each([
    ['koleksi tidak dikenal', [{ c: 'users', id: '1', data: {} }]],
    ['id kosong', [{ c: 'tasks', id: '', data: {} }]],
    ['id terlalu panjang', [{ c: 'tasks', id: 'x'.repeat(101), data: {} }]],
    ['id bukan string', [{ c: 'tasks', id: 123, data: {} }]],
    ['data berupa array', [{ c: 'tasks', id: 't', data: [1, 2] }]],
    ['data berupa string', [{ c: 'tasks', id: 't', data: 'teks' }]],
    ['elemen null', [null]],
    ['daftar kosong', []],
  ])('menolak: %s', async (_n, changes) => {
    const a = await signUp();
    await push(a.token, changes).expect(422);
    expect((await pull(a.token)).body.empty).toBe(true); // tidak ada yang tersimpan
  });

  it('menolak lebih dari 2000 perubahan dan body tanpa changes', async () => {
    const a = await signUp();
    await push(a.token, Array.from({ length: 2001 }, (_, i) => task(`t${i}`))).expect(422);
    await request(app).post('/api/sync').set(auth(a.token)).send({}).expect(422);
  });
});

describe('sinkronisasi: rev atomik', () => {
  it('push bersamaan menghasilkan rev unik berurutan dan semua data tersimpan', async () => {
    const a = await signUp();
    const N = 12;
    const results = await Promise.all(Array.from({ length: N }, (_, i) => push(a.token, [task(`c${i}`)])));

    expect(results.every((r) => r.status === 200)).toBe(true);
    const revs = results.map((r) => r.body.rev as number).sort((x, y) => x - y);
    expect(revs).toEqual(Array.from({ length: N }, (_, i) => i + 1)); // 1..N tanpa duplikat
    for (const r of results) expect(r.body.prev).toBe(r.body.rev - 1);
    expect((await pull(a.token)).body.collections.tasks).toHaveLength(N);
    const ws = await prisma.workspaces.findUnique({ where: { id: BigInt(a.workspaceId) } });
    expect(Number(ws!.rev)).toBe(N);
  });
});

describe('sinkronisasi: hak akses per peran', () => {
  it('anggota tidak boleh menulis koleksi khusus admin', async () => {
    const { member } = await team();
    for (const c of ['workspace', 'automations', 'invoices', 'expenses']) {
      await push(member.token, [{ c, id: 'x', data: { id: 'x' } }]).expect(403);
    }
  });

  it('penolakan atomik: perubahan sah dalam push yang sama ikut dibatalkan', async () => {
    const { member } = await team();
    await push(member.token, [task('t-ok'), { c: 'invoices', id: 'i', data: { id: 'i' } }]).expect(403);
    expect(await prisma.records.count({ where: { rid: 't-ok' } })).toBe(0);
  });

  it('anggota bebas bekerja di tugas/proyek/komentar dan memperbarui profilnya sendiri saja', async () => {
    const { member } = await team();
    await push(member.token, [task('t1')]).expect(200);
    await push(member.token, [{ c: 'comments', id: 'c1', data: { id: 'c1' } }]).expect(200);
    await push(member.token, [{ c: 'members', id: member.me, data: { id: member.me, name: 'Saya' } }]).expect(200);
    await push(member.token, [{ c: 'members', id: 'u99999', data: { id: 'u99999' } }]).expect(403);
  });

  it('catatan waktu/absensi: hanya milik sendiri', async () => {
    const { owner, member } = await team();
    await push(member.token, [{ c: 'timeEntries', id: 'te1', data: { id: 'te1', userId: member.me } }]).expect(200);
    await push(member.token, [{ c: 'timeEntries', id: 'te2', data: { id: 'te2', userId: 'u99999' } }]).expect(403);
    await push(member.token, [{ c: 'timeEntries', id: 'te3', data: { id: 'te3' } }]).expect(403); // tanpa userId
  });

  it('anggota tidak bisa merebut atau menghapus catatan orang lain (celah "klaim userId")', async () => {
    const { owner, member } = await team();
    await push(owner.token, [{ c: 'attendances', id: 'a1', data: { id: 'a1', userId: owner.me, checkIn: '08:00' } }]).expect(200);

    // Menimpa dengan mengaku userId sendiri: harus ditolak.
    await push(member.token, [{ c: 'attendances', id: 'a1', data: { id: 'a1', userId: member.me, checkIn: '23:59' } }]).expect(403);
    // Menghapus: ditolak.
    await push(member.token, [{ c: 'attendances', id: 'a1', data: null }]).expect(403);

    const rec = (await pull(owner.token)).body.collections.attendances;
    expect(rec).toEqual([{ id: 'a1', userId: owner.me, checkIn: '08:00' }]);
  });

  it('cuti: anggota hanya mengajukan (pending), persetujuan hanya admin', async () => {
    const { owner, member } = await team();
    const leave = (status: string) => [{ c: 'leaves', id: 'l1', data: { id: 'l1', userId: member.me, status } }];

    await push(member.token, leave('pending')).expect(200);
    await push(member.token, leave('approved')).expect(403);
    await push(owner.token, leave('approved')).expect(200);
  });

  it('admin boleh menulis semua koleksi', async () => {
    const { member: admin } = await team('admin');
    await push(admin.token, [
      { c: 'invoices', id: 'i', data: { id: 'i' } },
      { c: 'workspace', id: 'w', data: { id: 'w' } },
      { c: 'attendances', id: 'a', data: { id: 'a', userId: 'u1' } },
    ]).expect(200);
  });

  it('anggota baru melihat data yang sama dengan pemilik', async () => {
    const { owner, member } = await team();
    await push(owner.token, [task('t1', 'Dari pemilik')]).expect(200);
    expect((await pull(member.token)).body.collections.tasks[0].title).toBe('Dari pemilik');
  });
});
