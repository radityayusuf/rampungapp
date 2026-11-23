import { Response } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../types';

function isSuperadmin(req: AuthRequest): boolean {
  const u = req.user;
  return !!u && (u.role === 'superadmin' || u.email === 'admin@rampung.biz' || u.email === 'radityaysf06@gmail.com');
}

export async function getSystemStats(req: AuthRequest, res: Response): Promise<void> {
  if (!isSuperadmin(req)) {
    res.status(403).json({ message: 'Akses ditolak: Hanya Administrator Sistem yang dapat mengakses.' });
    return;
  }

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
    database: 'MySQL 8 (Connected)',
    websocket: 'Socket.io Active',
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

  const targetId = Number(req.params.id);
  if (!targetId || targetId === Number(req.user?.id)) {
    res.status(422).json({ message: 'Tidak dapat menghapus akun Anda sendiri.' });
    return;
  }

  await prisma.api_tokens.deleteMany({ where: { user_id: BigInt(targetId) } });
  await prisma.users.delete({ where: { id: BigInt(targetId) } });

  res.json({ message: 'Pengguna berhasil dihapus dari sistem.' });
}

export async function updateSystemUserRole(req: AuthRequest, res: Response): Promise<void> {
  if (!isSuperadmin(req)) {
    res.status(403).json({ message: 'Akses ditolak.' });
    return;
  }

  const targetId = Number(req.params.id);
  const { role } = req.body;
  const allowed = ['superadmin', 'owner', 'admin', 'member'];
  if (!allowed.includes(role)) {
    res.status(422).json({ message: 'Role tidak valid.' });
    return;
  }

  await prisma.users.update({
    where: { id: BigInt(targetId) },
    data: { role },
  });

  res.json({ message: 'Role pengguna berhasil diperbarui.', role });
}
