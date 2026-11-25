import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { cleanDemoData } from '../src/services/demoCleanup';
import request from 'supertest';
import { app, auth, push, pull, resetDb, signUp } from './helpers';


beforeEach(async () => {
  await resetDb();
});

describe('pembersihan data contoh lama', () => {
  it('menghapus data contoh beserta catatan yang merujuknya; data pengguna tetap utuh', async () => {
    const a = await signUp('Pemilik');
    const other = await signUp('Lain');
    const demo = [
      { c: 'projects', id: 'p-sinar', data: { id: 'p-sinar', name: 'Peluncuran Website PT Sinar Jaya', status: 'active' } },
      { c: 'tasks', id: 't-riset', data: { id: 't-riset', projectId: 'p-sinar', title: 'Riset referensi desain kompetitor' } },
      { c: 'members', id: 'usr-dimas', data: { id: 'usr-dimas', name: 'Dimas Aditya' } },
      { c: 'clients', id: 'cl-sinar', data: { id: 'cl-sinar', company: 'PT Sinar Jaya' } },
      { c: 'spaces', id: 'sp-web', data: { id: 'sp-web', name: 'Website Klien' } },
    ];
    const mine = [
      { c: 'projects', id: 'p-milikku', data: { id: 'p-milikku', name: 'Proyek Saya', status: 'active' } },
      { c: 'tasks', id: 't-milikku', data: { id: 't-milikku', projectId: 'p-milikku', title: 'Tugas saya' } },
      // ID kebetulan sama dengan data contoh, tetapi isinya milik pengguna → harus tetap ada
      { c: 'deals', id: 'd-1', data: { id: 'd-1', need: 'Kontrak pelanggan sungguhan' } },
      // komentar pengguna di tugas contoh → ikut terhapus (tugasnya hilang)
      { c: 'comments', id: 'cm-x', data: { id: 'cm-x', taskId: 't-riset', content: 'catatan saya di tugas contoh' } },
      { c: 'comments', id: 'cm-y', data: { id: 'cm-y', taskId: 't-milikku', content: 'komentar di tugas sendiri' } },
    ];
    await push(a.token, [...demo, ...mine]).expect(200);
    await push(other.token, [{ c: 'projects', id: 'p-sinar', data: { id: 'p-sinar', name: 'Peluncuran Website PT Sinar Jaya', status: 'active' } }]).expect(200);
    const revBefore = Number((await prisma.workspaces.findUnique({ where: { id: BigInt(a.workspaceId) } }))!.rev);

    // Pratinjau tidak menghapus
    const preview = await cleanDemoData({ apply: false, workspaceIds: [BigInt(a.workspaceId)] });
    expect(preview).toMatchObject({ total: 6, applied: false });
    expect((await pull(a.token)).body.collections.projects).toHaveLength(2);

    // Hapus hanya workspace yang dipilih
    const done = await cleanDemoData({ apply: true, workspaceIds: [BigInt(a.workspaceId)] });
    expect(done).toMatchObject({ total: 6, applied: true });
    const c = (await pull(a.token)).body.collections;
    expect(c.projects.map((p: { id: string }) => p.id)).toEqual(['p-milikku']);
    expect(c.tasks.map((t: { id: string }) => t.id)).toEqual(['t-milikku']);
    expect(c.deals.map((d: { id: string }) => d.id)).toEqual(['d-1']);
    expect(c.comments.map((x: { id: string }) => x.id)).toEqual(['cm-y']);
    expect((c.members ?? []).some((m: { id: string }) => m.id === 'usr-dimas')).toBe(false);
    expect((c.clients ?? []).length).toBe(0);
    expect(Number((await prisma.workspaces.findUnique({ where: { id: BigInt(a.workspaceId) } }))!.rev)).toBe(revBefore + 1);

    // Workspace lain tidak tersentuh karena dibatasi
    expect((await pull(other.token)).body.collections.projects).toHaveLength(1);

    // Dijalankan lagi: sudah bersih
    expect((await cleanDemoData({ apply: true, workspaceIds: [BigInt(a.workspaceId)] })).total).toBe(0);
  });

  it('lewat Panel Superadmin: hanya superadmin; pratinjau lalu hapus', async () => {
    const owner = await signUp('Pemilik');
    await push(owner.token, [{ c: 'projects', id: 'p-ops', data: { id: 'p-ops', name: 'Laporan Operasional Q4', status: 'active' } }]).expect(200);
    await request(app).post('/api/system/demo-cleanup').set(auth(owner.token)).send({ apply: true }).expect(403);
    const s = await signUp('Super');
    await prisma.users.update({ where: { id: BigInt(s.id) }, data: { role: 'superadmin' } });
    const pv = await request(app).post('/api/system/demo-cleanup').set(auth(s.token)).send({}).expect(200);
    expect(pv.body).toMatchObject({ total: 1, applied: false });
    const ok = await request(app).post('/api/system/demo-cleanup').set(auth(s.token)).send({ apply: true }).expect(200);
    expect(ok.body).toMatchObject({ total: 1, applied: true });
    expect((await pull(owner.token)).body.collections.projects ?? []).toHaveLength(0);
  });
});
