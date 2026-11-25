import { Response } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../types';
import { isSuperadminUser } from '../superadmin';
import { connectedClients } from '../socket';
import { isStr, parseId } from '../validation';
import { effectivePlan, isPlan } from '../services/plans';
import { broadcastSync } from '../socket';

function isSuperadmin(req: AuthRequest): boolean {
  return isSuperadminUser(req.user);
}

export async function getSystemStats(req: AuthRequest, res: Response): Promise<void> {
  if (!isSuperadmin(req)) {
    res.status(403).json({ message: 'Akses ditolak: Hanya Administrator Sistem yang dapat mengakses.' });
    return;
  }

  // Diukur sungguhan: versi dan waktu tanggap database, bukan teks tetap.
  const t0 = Date.now();
  const [{ v: dbVersion }] = await prisma.$queryRaw<{ v: string }[]>`SELECT VERSION() AS v`;
  const dbLatencyMs = Date.now() - t0;
  const ws = connectedClients();

  const [totalUsers, totalWorkspaces, totalRecords, totalUploads, storageSum] = await Promise.all([
    prisma.users.count(),
    prisma.workspaces.count(),
    prisma.records.count(),
    prisma.uploads.count(),
    prisma.uploads.aggregate({ _sum: { size: true } }),
  ]);

  res.json({
    totalUsers,
    totalWorkspaces,
    totalRecords,
    totalUploads,
    storageBytes: Number(storageSum._sum.size || 0),
    serverUptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    database: `MySQL ${dbVersion}`,
    dbLatencyMs,
    websocket: ws === null ? 'Tidak aktif' : `${ws} klien terhubung`,
    timestamp: new Date().toISOString(),
  });
}

export async function getSystemWorkspaces(req: AuthRequest, res: Response): Promise<void> {
  if (!isSuperadmin(req)) {
    res.status(403).json({ message: 'Akses ditolak.' });
    return;
  }

  const [workspaces, users, records] = await Promise.all([
    prisma.workspaces.findMany({ orderBy: { id: 'desc' } }),
    prisma.users.findMany({ select: { id: true, workspace_id: true, name: true, email: true, role: true } }),
    prisma.records.groupBy({ by: ['workspace_id'], _count: { id: true } }),
  ]);

  const recordMap = new Map(records.map((r) => [Number(r.workspace_id), r._count.id]));

  const result = workspaces.map((w) => {
    const wsUsers = users.filter((u) => Number(u.workspace_id) === Number(w.id));
    const owner = wsUsers.find((u) => u.role === 'owner' || u.role === 'superadmin') || wsUsers[0];
    return {
      id: Number(w.id),
      name: w.name,
      ownerName: owner?.name || 'Tanpa Pemilik',
      ownerEmail: owner?.email || '-',
      memberCount: wsUsers.length,
      recordCount: recordMap.get(Number(w.id)) || 0,
      plan: effectivePlan(w),
      planUntil: w.plan_until,
      createdAt: w.created_at,
    };
  });

  res.json({ workspaces: result });
}

export async function getSystemUsers(req: AuthRequest, res: Response): Promise<void> {
  if (!isSuperadmin(req)) {
    res.status(403).json({ message: 'Akses ditolak.' });
    return;
  }

  const [users, workspaces] = await Promise.all([
    prisma.users.findMany({ orderBy: { id: 'desc' } }),
    prisma.workspaces.findMany(),
  ]);

  const wsMap = new Map(workspaces.map((w) => [Number(w.id), w.name]));

  const result = users.map((u) => ({
    id: Number(u.id),
    name: u.name,
    email: u.email,
    role: u.role,
    workspaceId: Number(u.workspace_id),
    workspaceName: wsMap.get(Number(u.workspace_id)) || 'Workspace ' + u.workspace_id,
    createdAt: u.created_at,
  }));

  res.json({ users: result });
}

export async function deleteSystemUser(req: AuthRequest, res: Response): Promise<void> {
  if (!isSuperadmin(req)) {
    res.status(403).json({ message: 'Akses ditolak.' });
    return;
  }

  const target = parseId(req.params.id);
  if (target === null) {
    res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
    return;
  }
  if (target === req.user?.id) {
    res.status(422).json({ message: 'Tidak dapat menghapus akun Anda sendiri.' });
    return;
  }

  const found = await prisma.users.findUnique({ where: { id: target } });
  if (!found) {
    res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
    return;
  }

  await prisma.api_tokens.deleteMany({ where: { user_id: target } });
  await prisma.users.delete({ where: { id: target } });

  res.json({ message: 'Pengguna berhasil dihapus dari sistem.' });
}

export async function updateSystemUserRole(req: AuthRequest, res: Response): Promise<void> {
  if (!isSuperadmin(req)) {
    res.status(403).json({ message: 'Akses ditolak.' });
    return;
  }

  const target = parseId(req.params.id);
  const role = req.body?.role;
  const allowed = ['superadmin', 'owner', 'admin', 'member'];
  if (!isStr(role) || !allowed.includes(role)) {
    res.status(422).json({ message: 'Role tidak valid.' });
    return;
  }
  if (target === null || !(await prisma.users.findUnique({ where: { id: target } }))) {
    res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
    return;
  }

  await prisma.users.update({ where: { id: target }, data: { role } });

  res.json({ message: 'Role pengguna berhasil diperbarui.', role });
}

/** Superadmin menetapkan paket workspace secara manual (mis. Enterprise hasil negosiasi, kompensasi). */
export async function setWorkspacePlan(req: AuthRequest, res: Response): Promise<void> {
  if (!isSuperadmin(req)) {
    res.status(403).json({ message: 'Akses ditolak.' });
    return;
  }
  const id = parseId(req.params.id);
  const plan = req.body?.plan;
  const until = req.body?.until;
  if (!isPlan(plan)) {
    res.status(422).json({ message: 'Paket tidak valid.' });
    return;
  }
  let untilDate: Date | null = null;
  if (until !== undefined && until !== null) {
    untilDate = typeof until === 'string' ? new Date(until) : new Date(NaN);
    if (Number.isNaN(untilDate.getTime()) || untilDate.getTime() <= Date.now() || untilDate.getFullYear() > 2037) {
      res.status(422).json({ message: 'Tanggal berlaku harus di masa depan (paling lambat 2037).' });
      return;
    }
  }
  if (id === null || !(await prisma.workspaces.findUnique({ where: { id } }))) {
    res.status(404).json({ message: 'Workspace tidak ditemukan.' });
    return;
  }
  const ws = await prisma.workspaces.update({ where: { id }, data: { plan, plan_until: plan === 'gratis' ? null : untilDate, rev: { increment: 1 } } });
  broadcastSync(Number(id), { rev: Number(ws.rev), senderId: Number(req.user?.id ?? 0), applied: 0 });
  res.json({ id: Number(id), plan, planUntil: ws.plan_until?.toISOString() ?? null });
}
