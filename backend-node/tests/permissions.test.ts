import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, auth, pull, push, resetDb, signUp, task, team, useDefaultPlan } from './helpers';

beforeEach(async () => {
  await resetDb();
  useDefaultPlan('bisnis');
});

const rec = (c: string, data: { id: string } & Record<string, unknown>) => [{ c, id: data.id, data }];
const del = (c: string, id: string) => [{ c, id, data: null }];
const cols = async (token: string) => (await pull(token).expect(200)).body.collections;
const stored = async (rid: string) => {
  const row = await prisma.records.findFirst({ where: { rid } });
  return row ? JSON.parse(row.data) : null;
};

describe('hak anggota: tugas', () => {
  it('boleh mengubah tugas siapa pun, tetapi hanya menghapus buatannya sendiri', async () => {
    const { owner, member } = await team();
    await push(owner.token, [task('t-owner', 'Asli', { createdBy: owner.me })]).expect(200);
    await push(member.token, [task('t-owner', 'Diubah', { createdBy: owner.me, status: 'done' })]).expect(200);
    await push(member.token, del('tasks', 't-owner')).expect(403);
    expect((await cols(owner.token)).tasks).toMatchObject([{ id: 't-owner', title: 'Diubah' }]);

    await push(member.token, [task('t-saya', 'Punyaku', { createdBy: member.me })]).expect(200);
    await push(member.token, del('tasks', 't-saya')).expect(200);
    await push(owner.token, del('tasks', 't-owner')).expect(200);
  });

  it('tidak bisa mengakali hak hapus', async () => {
    const { owner, member } = await team();
    const base = { createdBy: owner.me };
    await push(owner.token, [task('t1', 'Asli', base), ...rec('projects', { id: 'p1', name: 'P', status: 'active' }), ...rec('projects', { id: 'p2', name: 'P2', status: 'active' })]).expect(200);
    const t = (extra: Record<string, unknown>, id = 't1') => [{ c: 'tasks', id, data: { id, title: 'Asli', projectId: 'p1', createdBy: owner.me, ...extra } }];

    await push(member.token, t({ createdBy: member.me })).expect(403); // mengaku pembuat
    await push(member.token, t({ createdBy: undefined })).expect(403);
    await push(member.token, t({ id: 'lain' })).expect(403); // id diganti
    await push(member.token, t({ title: '' })).expect(403); // dikosongkan
    await push(member.token, t({ projectId: 'tidak-ada' })).expect(403); // disembunyikan
    await push(member.token, t({ projectId: 'P2' })).expect(403); // beda huruf besar = bukan proyek yang sama
    await push(member.token, t({ createdBy: member.me }, 'T1')).expect(403); // menimpa lewat huruf besar
    await push(member.token, [...t({ createdBy: member.me }), ...del('tasks', 't1')]).expect(403);
    expect((await cols(owner.token)).tasks).toEqual([task('t1', 'Asli', base).data]);

    await push(member.token, t({ projectId: 'p2' })).expect(200); // pindah ke proyek yang ada tetap boleh
  });

  it('tugas baru wajib atas nama sendiri; tugas yang sudah dihapus admin tidak bisa dihidupkan lagi', async () => {
    const { owner, member } = await team();
    await push(member.token, [task('t1', 'X', { createdBy: owner.me })]).expect(403);
    await push(member.token, [task('t1')]).expect(403);
    await push(owner.token, [task('t2', 'X', { createdBy: owner.me })]).expect(200);
    await push(owner.token, del('tasks', 't2')).expect(200);
    await push(member.token, [task('t2', 'X lama', { createdBy: owner.me })]).expect(403);
  });
});

describe('hak anggota: komentar, space, klien, deal', () => {
  it('komentar: hanya miliknya; admin boleh memoderasi', async () => {
    const { owner, member } = await team();
    await push(owner.token, rec('comments', { id: 'c1', userId: owner.me, content: 'Asli' })).expect(200);
    await push(member.token, rec('comments', { id: 'c1', userId: owner.me, content: 'Diubah' })).expect(403);
    await push(member.token, rec('comments', { id: 'c1', userId: member.me, content: 'Direbut' })).expect(403);
    await push(member.token, del('comments', 'c1')).expect(403);
    await push(member.token, rec('comments', { id: 'c2', userId: owner.me, content: 'Menyamar' })).expect(403);
    await push(member.token, rec('comments', { id: 'c2', userId: member.me, content: 'Halo' })).expect(200);
    await push(owner.token, del('comments', 'c2')).expect(200);
    expect((await cols(owner.token)).comments).toEqual([{ id: 'c1', userId: owner.me, content: 'Asli' }]);
  });

  it.each([
    ['spaces', { id: 's1', name: 'Umum' }, { name: '' }],
    ['clients', { id: 'cl1', company: 'PT A' }, { company: ' ' }],
    ['deals', { id: 'd1', clientId: 'cl1', need: 'Web' }, { clientId: '' }],
  ])('%s: boleh membuat & mengubah, tidak boleh menghapus atau mengosongkan', async (c, data, empty) => {
    const { owner, member } = await team();
    await push(member.token, rec(c, data)).expect(200);
    await push(member.token, rec(c, { ...data, note: 'ubah' })).expect(200);
    await push(member.token, del(c, data.id)).expect(403);
    await push(member.token, rec(c, { ...data, ...empty })).expect(403);
    await push(member.token, [{ c, id: data.id, data: { ...data, id: 'lain' } }]).expect(403);
    await push(member.token, rec(c, { ...data, id: data.id.toUpperCase() })).expect(403);
    expect((await cols(owner.token))[c]).toEqual([{ ...data, note: 'ubah' }]);
    await push(owner.token, del(c, data.id)).expect(200);
  });
});

describe('hak anggota: portal klien & anggaran proyek', () => {
  const p = { id: 'p1', name: 'Web', status: 'active', docsContent: 'lama', budget: 50_000_000, spent: 2_000_000, clientPortalEnabled: false };

  it('tidak bisa menyalakan atau mematikan portal, baik di proyek lama maupun baru', async () => {
    const { owner, member } = await team();
    await push(owner.token, rec('projects', p)).expect(200);
    await push(member.token, rec('projects', { ...p, clientPortalEnabled: true, portalToken: 'tokenpalsu123456' }));
    expect(await stored('p1')).toEqual(p);
    await push(member.token, rec('projects', { ...p, id: 'p2', clientPortalEnabled: true, portalToken: 'tokenpalsu123456' }));
    expect(await stored('p2')).toMatchObject({ clientPortalEnabled: false });
    expect((await stored('p2')).portalToken).toBeUndefined();
    await request(app).get('/api/portal/tokenpalsu123456').expect(404);

    const on = { ...p, clientPortalEnabled: true, portalToken: 'tokenasli1234567' };
    await push(owner.token, rec('projects', on)).expect(200);
    await push(member.token, rec('projects', { ...p, docsContent: 'baru' })).expect(200); // data usang: portal tetap menyala
    expect(await stored('p1')).toEqual({ ...on, docsContent: 'baru' });
  });

  it('anggaran tidak dikirim ke anggota dan tidak hilang/berubah saat anggota menyimpan proyek', async () => {
    const { owner, member } = await team();
    await push(owner.token, rec('projects', p)).expect(200);
    const seen = (await cols(member.token)).projects[0];
    expect(seen).not.toHaveProperty('budget');
    expect(seen).not.toHaveProperty('spent');
    await push(member.token, rec('projects', { ...seen, docsContent: 'baru' })).expect(200);
    await push(member.token, rec('projects', { ...seen, docsContent: 'baru', budget: 1, spent: 0 })).expect(200);
    expect(await stored('p1')).toEqual({ ...p, docsContent: 'baru' });
  });

  it('anggota yang baru naik jadi admin tidak menghapus anggaran lewat data lamanya; admin tetap bisa mengubahnya', async () => {
    const { owner, member } = await team();
    await push(owner.token, rec('projects', p)).expect(200);
    const seen = (await cols(member.token)).projects[0];
    await request(app).patch(`/api/members/${member.id}`).set(auth(owner.token)).send({ role: 'admin' }).expect(200);
    await push(member.token, rec('projects', { ...seen, name: 'Web Baru' })).expect(200);
    expect(await stored('p1')).toEqual({ ...p, name: 'Web Baru' });
    await push(member.token, rec('projects', { ...p, budget: 7 })).expect(200);
    expect((await stored('p1')).budget).toBe(7);
  });
});

describe('hak anggota: keuangan & cuti tidak bocor', () => {
  it('invoice dan pengeluaran tidak dikirim ke anggota, tetapi lengkap untuk pemilik dan admin', async () => {
    const { owner, member } = await team();
    await push(owner.token, [...rec('invoices', { id: 'i1', number: 'INV-1' }), ...rec('expenses', { id: 'e1', amount: 5 })]).expect(200);
    const res = await pull(member.token).expect(200);
    expect(res.body.collections).toMatchObject({ invoices: [], expenses: [] });
    expect(JSON.stringify(res.body)).not.toContain('INV-1');
    expect(res.body.empty).toBe(false); // workspace tidak dianggap kosong
    expect((await cols(owner.token)).invoices).toHaveLength(1);

    const outsider = await signUp();
    expect(JSON.stringify((await pull(outsider.token)).body)).not.toContain('INV-1');
  });

  it('perubahan peran langsung berlaku: rev naik dan data menyesuaikan', async () => {
    const { owner, member } = await team();
    await push(owner.token, rec('invoices', { id: 'i1', number: 'INV-1' })).expect(200);
    const setRole = (role: string) => request(app).patch(`/api/members/${member.id}`).set(auth(owner.token)).send({ role }).expect(200);
    const before = (await pull(member.token)).body;
    expect(before.role).toBe('member');

    await setRole('admin');
    const asAdmin = (await pull(member.token)).body;
    expect(asAdmin.rev).toBeGreaterThan(before.rev);
    expect(asAdmin.role).toBe('admin');
    expect(asAdmin.collections.invoices).toHaveLength(1);

    await setRole('member');
    const again = (await pull(member.token)).body;
    expect(again.rev).toBeGreaterThan(asAdmin.rev);
    expect(again.collections.invoices).toEqual([]);
  });

  it('cuti: milik sendiri lengkap; milik rekan hanya yang disetujui, tanpa jenis dan alasan', async () => {
    const { owner, member } = await team();
    const base = { startDate: '2026-11-01', endDate: '2026-11-02' };
    const lv = (id: string, userId: string, status: string) => ({ id, userId, status, type: 'sakit', reason: 'RAHASIA', ...base });
    await push(owner.token, [...rec('leaves', lv('l1', owner.me, 'approved')), ...rec('leaves', lv('l2', owner.me, 'pending')), ...rec('leaves', lv('l3', owner.me, 'rejected'))]).expect(200);
    await push(member.token, rec('leaves', lv('l4', member.me, 'pending'))).expect(200);
    expect((await cols(member.token)).leaves).toEqual([{ id: 'l1', userId: owner.me, status: 'approved', ...base }, lv('l4', member.me, 'pending')]);
    expect((await cols(owner.token)).leaves).toHaveLength(4);

    // Persetujuan dari layar yang datanya belum lengkap tidak menghapus alasan.
    await push(owner.token, rec('leaves', { id: 'l4', userId: member.me, status: 'approved', ...base })).expect(200);
    expect(await stored('l4')).toEqual(lv('l4', member.me, 'approved'));
    await push(member.token, del('leaves', 'l1')).expect(403);

    // Cuti sendiri: boleh dibatalkan selama menunggu; setelah diputuskan hanya oleh pemilik/admin.
    await push(member.token, del('leaves', 'l4')).expect(403);
    await push(member.token, rec('leaves', lv('l4', member.me, 'pending'))).expect(403);
    await push(member.token, rec('leaves', lv('l5', member.me, 'pending'))).expect(200);
    await push(member.token, del('leaves', 'l5')).expect(200);
    await push(owner.token, del('leaves', 'l4')).expect(200);
  });

  it('anggota tidak bisa menaikkan peran lewat profilnya atau menghapus profil', async () => {
    const { member } = await team();
    await push(member.token, rec('members', { id: member.me, name: 'Saya', role: 'owner' })).expect(200);
    expect(await stored(member.me)).toMatchObject({ name: 'Saya', role: 'member' });
    await push(member.token, del('members', member.me)).expect(403);
    await push(member.token, [{ c: 'members', id: member.me, data: { id: 'u99999', name: 'X' } }]).expect(403);
  });

  it('admin tetap berhak penuh', async () => {
    const { owner, member: admin } = await team('admin');
    await push(owner.token, [task('t1', 'X', { createdBy: owner.me }), ...rec('comments', { id: 'c1', userId: owner.me }), ...rec('spaces', { id: 's1', name: 'S' }), ...rec('clients', { id: 'cl1', company: 'A' }), ...rec('deals', { id: 'd1', clientId: 'cl1' })]).expect(200);
    await push(admin.token, [...del('tasks', 't1'), ...del('comments', 'c1'), ...del('spaces', 's1'), ...del('clients', 'cl1'), ...del('deals', 'd1')]).expect(200);
    expect(await cols(owner.token)).toMatchObject({ tasks: [], comments: [], spaces: [], clients: [], deals: [] });
  });
});
