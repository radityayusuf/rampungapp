import { Response } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../types';
import { broadcastSync } from '../socket';
import { LIMITS, PLAN_LABEL } from '../services/plans';
import { activeProjectCount, isActiveProject, planOf, stampWorkspaceRecord } from '../services/workspacePlan';

export const COLLECTIONS = [
  'workspace', 'members', 'spaces', 'projects', 'tasks', 'comments', 'activities', 'notifications',
  'timeEntries', 'clients', 'deals', 'invoices', 'expenses', 'attendances', 'leaves', 'automations',
] as const;

export type CollectionName = typeof COLLECTIONS[number];

/** Hanya pemilik/admin yang boleh mengubah. */
const ADMIN_ONLY: string[] = ['workspace', 'automations', 'invoices', 'expenses'];
/** Catatan pribadi: anggota hanya boleh membuat, mengubah, dan menghapus miliknya sendiri. */
const OWN_ONLY: string[] = ['timeEntries', 'attendances', 'comments', 'leaves'];
/** Anggota boleh membuat & mengubah, tetapi tidak menghapus. required: kolom yang tidak boleh dikosongkan. */
const NO_DELETE: Record<string, { required: string; label: string }> = {
  projects: { required: 'name', label: 'proyek' },
  spaces: { required: 'name', label: 'space' },
  clients: { required: 'company', label: 'klien' },
  deals: { required: 'clientId', label: 'deal' },
};
/** Tidak pernah dikirim ke anggota. */
const FINANCE_ONLY: string[] = ['invoices', 'expenses'];
const PROJECT_FINANCE = ['budget', 'spent'];
const PROJECT_PORTAL = ['clientPortalEnabled', 'portalToken'];
const LEAVE_PRIVATE = ['type', 'reason'];

const isManager = (user: any): boolean => user.role === 'owner' || user.role === 'admin' || user.role === 'superadmin';
const filled = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

const omit = (o: any, keys: string[]) => {
  const copy = { ...o };
  for (const k of keys) delete copy[k];
  return copy;
};

async function existingRecord(workspaceId: bigint, collection: string, rid: string): Promise<{ rid: string; data: any } | null> {
  const row = await prisma.records.findUnique({
    where: { workspace_id_collection_rid: { workspace_id: workspaceId, collection, rid } },
  });
  if (!row) return null;
  let data: any = {};
  try {
    data = JSON.parse(row.data) ?? {};
  } catch {
    // catatan rusak diperlakukan kosong
  }
  return { rid: row.rid, data };
}

/** Bentuk catatan yang boleh dilihat pengguna ini; null bila tidak boleh melihatnya sama sekali. */
function visible(user: any, collection: string, data: any): any | null {
  if (isManager(user)) return data;
  if (FINANCE_ONLY.includes(collection)) return null;
  if (collection === 'projects') return omit(data, PROJECT_FINANCE);
  if (collection === 'leaves' && data.userId !== `u${user.id}`) {
    // Rekan cukup tahu siapa yang cuti dan kapan; jenis & alasannya pribadi.
    return data.status === 'approved' ? omit(data, LEAVE_PRIVATE) : null;
  }
  return data;
}

/** Alasan penolakan untuk anggota biasa, atau null bila boleh. Pemilik/admin/superadmin selalu boleh. */
async function denied(user: any, changes: any[]): Promise<string | null> {
  if (isManager(user)) return null;

  const wsId = BigInt(user.workspace_id);
  const me = `u${user.id}`;

  for (const ch of changes) {
    const c = ch.c;
    const data = ch.data ?? null;

    if (ADMIN_ONLY.includes(c)) return 'Hanya pemilik atau admin yang boleh mengubah data ini.';

    if (c === 'members' && (ch.id !== me || data === null)) return 'Anggota hanya boleh mengubah profilnya sendiri.';

    // "Menghapus" dengan menimpa: id di dalam data diganti, atau id yang oleh database dianggap sama
    // (kolom rid tidak membedakan huruf besar/kecil: "P1" menimpa "p1").
    if (data !== null && data.id !== ch.id) return 'Data tidak valid: id tidak cocok.';
    const old = await existingRecord(wsId, c, ch.id);
    if (old && old.rid !== ch.id) return 'Data tidak valid: id sudah dipakai.';

    if (OWN_ONLY.includes(c)) {
      // Pemilik catatan yang SUDAH ada menentukan boleh/tidaknya; data baru tidak boleh mengklaim milik orang lain.
      if ((old && old.data.userId !== me) || (data !== null && data.userId !== me)) {
        return 'Anggota hanya boleh mengubah catatan miliknya sendiri.';
      }
      if (c === 'leaves' && data !== null && (data.status || 'pending') !== 'pending') {
        return 'Persetujuan cuti hanya bisa dilakukan pemilik atau admin.';
      }
      // Pengajuan yang sudah diputuskan tidak bisa diubah atau dihapus diam-diam oleh pengajunya.
      if (c === 'leaves' && old && (old.data.status || 'pending') !== 'pending') {
        return 'Cuti yang sudah diputuskan hanya bisa dibatalkan pemilik atau admin.';
      }
    }

    const rule = NO_DELETE[c];
    if (rule) {
      if (data === null) return `Hanya pemilik atau admin yang boleh menghapus ${rule.label}.`;
      if (!filled(data[rule.required])) return `Data ${rule.label} tidak lengkap.`;
    }
    if (c === 'projects' && old && data.status !== old.data.status) {
      return 'Hanya pemilik atau admin yang boleh mengubah status proyek.';
    }

    if (c === 'tasks') {
      if (data === null) {
        if (old && old.data.createdBy !== me) return 'Anggota hanya boleh menghapus tugas buatannya sendiri.';
        continue;
      }
      if (!filled(data.title)) return 'Data tugas tidak lengkap.';
      // Pembuat tugas menentukan hak hapus, jadi tidak boleh dipalsukan atau dialihkan.
      if (data.createdBy !== (old ? old.data.createdBy : me)) {
        return old ? 'Pembuat tugas tidak bisa diubah.' : 'Tugas ini sudah dihapus atau pembuatnya tidak sesuai.';
      }
      // Memindahkan tugas ke proyek yang tidak ada sama dengan menghilangkannya.
      if (old && data.projectId !== old.data.projectId) {
        const inPush = changes.some((x) => x.c === 'projects' && x.id === data.projectId && x.data);
        if (!filled(data.projectId) || (!inPush && (await existingRecord(wsId, 'projects', data.projectId))?.rid !== data.projectId)) {
          return 'Proyek tujuan tugas tidak ditemukan.';
        }
      }
    }
  }

  return null;
}

/**
 * Kolom yang tidak dilihat atau tidak boleh diubah pengirim dipulihkan dari catatan server, sehingga menyimpan
 * perubahan lain (mis. dokumen proyek) tidak menghapusnya.
 */
async function restoreProtected(user: any, changes: any[]): Promise<void> {
  const wsId = BigInt(user.workspace_id);
  const manager = isManager(user);
  for (const ch of changes) {
    if (!ch.data) continue;

    if (ch.c === 'members' && !manager) ch.data = { ...ch.data, role: user.role };

    const hidden = ch.c === 'projects' ? PROJECT_FINANCE : ch.c === 'leaves' ? LEAVE_PRIVATE : null;
    if (!hidden) continue;
    const missing = hidden.filter((k) => ch.data[k] === undefined);
    const locked = !manager && ch.c === 'projects';
    if (!locked && !missing.length) continue;

    const old = await existingRecord(wsId, ch.c, ch.id);
    if (!old) {
      // Proyek baru dari anggota: portal klien (membuka data ke luar) hanya boleh dinyalakan pemilik/admin.
      if (locked) ch.data = { ...omit(ch.data, PROJECT_PORTAL), clientPortalEnabled: false };
      continue;
    }
    const next = { ...ch.data };
    for (const k of locked ? [...PROJECT_FINANCE, ...PROJECT_PORTAL] : missing) {
      if (old.data[k] === undefined) delete next[k];
      else next[k] = old.data[k];
    }
    ch.data = next;
  }
}

export async function pull(req: AuthRequest, res: Response): Promise<void> {
  const wsId = req.user?.workspace_id;
  if (!wsId) {
    res.status(401).json({ message: 'Sesi tidak valid.' });
    return;
  }

  const out: Record<string, any[]> = {};
  for (const c of COLLECTIONS) {
    out[c] = [];
  }

  const ws = await prisma.workspaces.findUnique({
    where: { id: BigInt(wsId) },
  });
  const rev = ws?.rev ? Number(ws.rev) : 0;

  const rows = await prisma.records.findMany({
    where: { workspace_id: BigInt(wsId) },
    orderBy: { id: 'asc' },
  });

  let count = 0;
  for (const r of rows) {
    if (out[r.collection]) {
      try {
        const data = JSON.parse(r.data);
        count++;
        const shown = visible(req.user, r.collection, data);
        if (shown !== null) out[r.collection].push(shown);
      } catch (e) {
        // Skip corrupted data
      }
    }
  }

  // Paket & modul selalu dari server: nilai yang ditulis klien di catatan workspace tidak dipercaya.
  const p = await planOf(BigInt(wsId));
  out.workspace = out.workspace.map((w) => stampWorkspaceRecord(w, p));

  res.json({
    empty: count === 0,
    rev,
    role: req.user?.role, // peran terkini: klien menyesuaikan tampilannya tanpa perlu masuk ulang
    collections: out,
  });
}

export async function getRev(req: AuthRequest, res: Response): Promise<void> {
  const wsId = req.user?.workspace_id;
  if (!wsId) {
    res.status(401).json({ message: 'Sesi tidak valid.' });
    return;
  }

  const ws = await prisma.workspaces.findUnique({
    where: { id: BigInt(wsId) },
  });

  res.json({ rev: ws?.rev ? Number(ws.rev) : 0 });
}

export async function push(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user || !user.workspace_id) {
    res.status(401).json({ message: 'Sesi tidak valid.' });
    return;
  }

  const wsId = BigInt(user.workspace_id);
  const changes = req.body?.changes;

  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 2000) {
    res.status(422).json({ message: 'Perubahan tidak valid.' });
    return;
  }

  // Validasi bentuk: koleksi dikenal, id string 1-100 karakter, data null atau objek (bukan array/string/angka).
  const known = COLLECTIONS as readonly string[];
  const valid = (ch: any) =>
    !!ch && typeof ch === 'object' && typeof ch.c === 'string' && known.includes(ch.c) &&
    typeof ch.id === 'string' && ch.id.length > 0 && ch.id.length <= 100 &&
    (ch.data === null || ch.data === undefined || (typeof ch.data === 'object' && !Array.isArray(ch.data)));
  const bad = changes.find((ch) => !valid(ch));
  if (bad !== undefined) {
    res.status(422).json({ message: 'Format perubahan salah.' });
    return;
  }

  const denial = await denied(user, changes);
  if (denial) {
    res.status(403).json({ message: denial });
    return;
  }

  await restoreProtected(user, changes);

  // Paket ditentukan server: plan/planUntil/modul pada catatan workspace ditimpa sesuai paket yang dibayar.
  const p = await planOf(wsId);
  for (const ch of changes) {
    if (ch.c === 'workspace' && ch.data) ch.data = stampWorkspaceRecord(ch.data, p);
  }

  // Batas proyek aktif paket (mis. Gratis: 3). Hanya menolak perubahan yang MENAMBAH proyek aktif di atas batas,
  // sehingga workspace yang sudah melebihi batas tetap bisa mengubah/menutup proyeknya.
  const maxProjects = LIMITS[p.plan].activeProjects;
  if (maxProjects !== null && changes.some((ch) => ch.c === 'projects')) {
    const map = await activeProjectCount(wsId);
    const before = [...map.values()].filter(isActiveProject).length;
    for (const ch of changes) {
      if (ch.c !== 'projects') continue;
      if (ch.data == null) map.delete(ch.id);
      else map.set(ch.id, ch.data);
    }
    const after = [...map.values()].filter(isActiveProject).length;
    if (after > maxProjects && after > before) {
      res.status(403).json({ message: `Paket ${PLAN_LABEL[p.plan]} maksimal ${maxProjects} proyek aktif. Selesaikan proyek lain atau tingkatkan paket.` });
      return;
    }
  }

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // Kenaikan atomik: UPDATE mengunci baris workspace sampai transaksi selesai, sehingga push bersamaan
    // berurutan dan setiap push mendapat nomor rev yang unik (tidak ada pembaruan yang terlewat oleh polling).
    const bumped = await tx.workspaces.update({
      where: { id: wsId },
      data: { rev: { increment: 1 } },
    });
    const nextRev = Number(bumped.rev);

    for (const ch of changes) {
      if (ch.data === null || ch.data === undefined) {
        await tx.records.deleteMany({
          where: {
            workspace_id: wsId,
            collection: ch.c,
            rid: ch.id,
          },
        });
      } else {
        const jsonData = JSON.stringify(ch.data);
        await tx.records.upsert({
          where: {
            workspace_id_collection_rid: {
              workspace_id: wsId,
              collection: ch.c,
              rid: ch.id,
            },
          },
          create: {
            workspace_id: wsId,
            collection: ch.c,
            rid: ch.id,
            data: jsonData,
            created_at: now,
            updated_at: now,
          },
          update: {
            data: jsonData,
            updated_at: now,
          },
        });
      }
    }

    return { prev: nextRev - 1, rev: nextRev };
  });

  // Broadcast real-time sync notification
  broadcastSync(Number(wsId), {
    rev: result.rev,
    senderId: Number(user.id),
    applied: changes.length,
  });

  res.json({
    ok: true,
    applied: changes.length,
    rev: result.rev,
    prev: result.prev,
  });
}
