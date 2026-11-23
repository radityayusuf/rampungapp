import { Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../db';
import { AuthRequest } from '../types';

function isAdmin(user: any): boolean {
  return user.role === 'owner' || user.role === 'admin' || user.role === 'superadmin';
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}

export async function members(req: AuthRequest, res: Response): Promise<void> {
  const wsId = req.user?.workspace_id;
  if (!wsId) {
    res.status(401).json({ message: 'Sesi tidak valid.' });
    return;
  }

  const rows = await prisma.users.findMany({
    where: { workspace_id: BigInt(wsId) },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  res.json({
    members: rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      email: r.email,
      role: r.role,
    })),
  });
}

export async function updateMember(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user || (user.role !== 'owner' && user.role !== 'superadmin')) {
    res.status(403).json({ message: 'Hanya pemilik yang boleh mengubah peran.' });
    return;
  }

  const targetId = parseInt(String(req.params.id), 10);
  const { role } = req.body;

  if (role !== 'admin' && role !== 'member') {
    res.status(422).json({ message: 'Peran tidak valid.' });
    return;
  }

  const member = await prisma.users.findFirst({
    where: { id: BigInt(targetId), workspace_id: user.workspace_id },
  });

  if (!member) {
    res.status(404).json({ message: 'Anggota tidak ditemukan.' });
    return;
  }

  if (member.role === 'owner') {
    res.status(422).json({ message: 'Peran pemilik tidak bisa diubah.' });
    return;
  }

  await prisma.users.update({
    where: { id: BigInt(targetId) },
    data: { role },
  });

  res.json({ ok: true });
}

export async function removeMember(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user || !isAdmin(user)) {
    res.status(403).json({ message: 'Hanya pemilik atau admin yang boleh melakukan ini.' });
    return;
  }

  const targetId = parseInt(String(req.params.id), 10);
  const member = await prisma.users.findFirst({
    where: { id: BigInt(targetId), workspace_id: user.workspace_id },
  });

  if (!member) {
    res.status(404).json({ message: 'Anggota tidak ditemukan.' });
    return;
  }

  if (member.role === 'owner' || member.id === user.id) {
    res.status(422).json({ message: 'Pemilik atau diri sendiri tidak bisa dikeluarkan.' });
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Revoke sessions
    await tx.api_tokens.deleteMany({
      where: { user_id: member.id },
    });

    // Create a new separate workspace for the removed user
    const newWs = await tx.workspaces.create({
      data: {
        name: `Workspace ${member.name}`,
        owner_id: member.id,
      },
    });

    await tx.users.update({
      where: { id: member.id },
      data: {
        workspace_id: newWs.id,
        role: 'owner',
      },
    });
  });

  res.json({ ok: true });
}

// ─── Invites ───

export async function invites(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user || !isAdmin(user) || !user.workspace_id) {
    res.status(403).json({ message: 'Hanya pemilik atau admin yang boleh melakukan ini.' });
    return;
  }

  const rows = await prisma.invites.findMany({
    where: {
      workspace_id: user.workspace_id,
      accepted_at: null,
    },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      token: true,
      created_at: true,
    },
  });

  res.json({
    invites: rows.map((r) => ({
      id: Number(r.id),
      email: r.email,
      role: r.role,
      token: r.token,
      created_at: r.created_at ? r.created_at.toISOString() : '',
    })),
  });
}

export async function invite(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user || !isAdmin(user) || !user.workspace_id) {
    res.status(403).json({ message: 'Hanya pemilik atau admin yang boleh melakukan ini.' });
    return;
  }

  const { email, role } = req.body;
  if (!email || !email.includes('@')) {
    res.status(422).json({ message: 'Email tidak valid.' });
    return;
  }
  if (role !== 'admin' && role !== 'member') {
    res.status(422).json({ message: 'Peran harus admin atau member.' });
    return;
  }

  const existingUser = await prisma.users.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existingUser) {
    res.status(422).json({ message: 'Email ini sudah punya akun Rampung.' });
    return;
  }

  const wsId = user.workspace_id;
  await prisma.invites.deleteMany({
    where: {
      workspace_id: wsId,
      email: email.toLowerCase(),
      accepted_at: null,
    },
  });

  const token = randomString(32);
  await prisma.invites.create({
    data: {
      workspace_id: wsId,
      email: email.toLowerCase(),
      role,
      token,
      invited_by: user.id,
    },
  });

  const ws = await prisma.workspaces.findUnique({ where: { id: wsId } });
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const link = `${frontendUrl}/#/gabung/${token}`;
  console.log(`[INVITE] Link for ${email} to join ${ws?.name || 'Workspace'}: ${link}`);

  res.status(201).json({
    token,
    email: email.toLowerCase(),
    role,
    emailed: true,
  });
}

export async function revokeInvite(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user || !isAdmin(user) || !user.workspace_id) {
    res.status(403).json({ message: 'Hanya pemilik atau admin yang boleh melakukan ini.' });
    return;
  }

  const id = parseInt(String(req.params.id), 10);
  await prisma.invites.deleteMany({
    where: {
      id: BigInt(id),
      workspace_id: user.workspace_id,
    },
  });

  res.json({ ok: true });
}

export async function showInvite(req: AuthRequest, res: Response): Promise<void> {
  const token = String(req.params.token || '');
  const inv = await prisma.invites.findFirst({
    where: { token, accepted_at: null },
  });

  if (!inv) {
    res.status(404).json({ message: 'Undangan tidak valid atau sudah dipakai.' });
    return;
  }

  const ws = await prisma.workspaces.findUnique({
    where: { id: inv.workspace_id },
  });

  res.json({
    email: inv.email,
    role: inv.role,
    workspace_name: ws?.name || 'Workspace',
  });
}

// ─── Personal API Tokens ───

export async function tokens(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'Sesi tidak valid.' });
    return;
  }

  const rows = await prisma.api_tokens.findMany({
    where: {
      user_id: user.id,
      name: { not: null },
    },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      name: true,
      created_at: true,
      last_used_at: true,
    },
  });

  res.json({
    tokens: rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      created_at: r.created_at ? r.created_at.toISOString() : '',
      last_used_at: r.last_used_at ? r.last_used_at.toISOString() : null,
    })),
  });
}

export async function createToken(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'Sesi tidak valid.' });
    return;
  }

  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(422).json({ message: 'Nama token harus diisi.' });
    return;
  }

  const count = await prisma.api_tokens.count({
    where: {
      user_id: user.id,
      name: { not: null },
    },
  });

  if (count >= 10) {
    res.status(422).json({ message: 'Maksimal 10 token API.' });
    return;
  }

  const plain = `rmp_${randomString(40)}`;
  const hash = crypto.createHash('sha256').update(plain).digest('hex');

  await prisma.api_tokens.create({
    data: {
      user_id: user.id,
      name: name.trim().slice(0, 60),
      token_hash: hash,
      last_used_at: new Date(),
    },
  });

  res.status(201).json({ token: plain });
}

export async function deleteToken(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'Sesi tidak valid.' });
    return;
  }

  const id = parseInt(String(req.params.id), 10);
  await prisma.api_tokens.deleteMany({
    where: {
      id: BigInt(id),
      user_id: user.id,
      name: { not: null },
    },
  });

  res.json({ ok: true });
}
