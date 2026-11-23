import { Response } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../types';
import { broadcastSync } from '../socket';

export const COLLECTIONS = [
  'workspace', 'members', 'spaces', 'projects', 'tasks', 'comments', 'activities', 'notifications',
  'timeEntries', 'clients', 'deals', 'invoices', 'expenses', 'attendances', 'leaves', 'automations',
] as const;

export type CollectionName = typeof COLLECTIONS[number];

const ADMIN_ONLY: string[] = ['workspace', 'automations', 'invoices', 'expenses', 'clients', 'deals'];
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
  if (user.role === 'owner' || user.role === 'admin') {
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
      const owner = (data && data.userId) ? data.userId : await existingOwner(BigInt(user.workspace_id), c, ch.id);
      if (owner !== null && owner !== me) {
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
  const changes = req.body.changes;

  if (!Array.isArray(changes) || changes.length > 2000) {
    res.status(422).json({ message: 'Perubahan tidak valid.' });
    return;
  }

  // Validate format
  for (const ch of changes) {
    if (!ch.c || !COLLECTIONS.includes(ch.c) || !ch.id) {
      res.status(422).json({ message: `Format perubahan salah: ${ch.c}/${ch.id}` });
      return;
    }
  }

  const denial = await denied(user, changes);
  if (denial) {
    res.status(403).json({ message: denial });
    return;
  }

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const ws = await tx.workspaces.findUnique({
      where: { id: wsId },
    });
    const prev = ws?.rev ? Number(ws.rev) : 0;

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

    const nextRev = prev + 1;
    await tx.workspaces.update({
      where: { id: wsId },
      data: { rev: BigInt(nextRev) },
    });

    return { prev, rev: nextRev };
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
