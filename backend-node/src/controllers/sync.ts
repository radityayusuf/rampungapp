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

const ADMIN_ONLY: string[] = ['workspace', 'automations', 'invoices', 'expenses'];
const OWN_ONLY: string[] = ['timeEntries', 'attendances'];

async function existingOwner(workspaceId: bigint, collection: string, rid: string): Promise<string | null> {
  const row = await prisma.records.findUnique({
    where: {
      workspace_id_collection_rid: {
        workspace_id: workspaceId,
        collection,
        rid,
      },
    },
  });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.data);
    return parsed.userId || null;
  } catch {
    return null;
  }
}

async function denied(user: any, changes: any[]): Promise<string | null> {
  if (user.role === 'owner' || user.role === 'admin' || user.role === 'superadmin') {
    return null;
  }

  const me = `u${user.id}`;

  for (const ch of changes) {
    const c = ch.c;
    const data = ch.data ?? null;

    if (ADMIN_ONLY.includes(c)) {
      return 'Hanya pemilik atau admin yang boleh mengubah data ini.';
    }

    if (c === 'members' && ch.id !== me) {
      return 'Anggota hanya boleh mengubah profilnya sendiri.';
    }

    if (OWN_ONLY.includes(c) || c === 'leaves') {
      // Pemilik catatan yang SUDAH ada menentukan boleh/tidaknya; data baru tidak boleh mengklaim milik orang lain,
      // dan tidak boleh "mencuri" catatan orang lain dengan menulis userId miliknya sendiri.
      const existing = await existingOwner(BigInt(user.workspace_id), c, ch.id);
      if (existing !== null && existing !== me) {
        return 'Anggota hanya boleh mengubah catatan miliknya sendiri.';
      }
      if (data !== null && data.userId !== me) {
        return 'Anggota hanya boleh mengubah catatan miliknya sendiri.';
      }
      if (c === 'leaves' && data !== null && (data.status || 'pending') !== 'pending') {
        return 'Persetujuan cuti hanya bisa dilakukan pemilik atau admin.';
      }
    }
  }

  return null;
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
        out[r.collection].push(JSON.parse(r.data));
        count++;
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
