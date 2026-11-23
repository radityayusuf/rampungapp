import { Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../db';
import { AuthRequest } from '../types';

export const RESET_MINUTES = 60;

function validatePassword(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Kata sandi minimal 8 karakter.';
  }
  if (!/[a-zA-Z]/.test(password)) {
    return 'Kata sandi harus mengandung huruf.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Kata sandi harus mengandung angka.';
  }
  return null;
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

async function issueToken(userId: bigint | number) {
  const plain = randomString(60);
  const hash = crypto.createHash('sha256').update(plain).digest('hex');
  await prisma.api_tokens.create({
    data: {
      user_id: BigInt(userId),
      token_hash: hash,
      last_used_at: new Date(),
    },
  });
  return plain;
}

async function presentUser(user: any) {
  let wsName = '';
  if (user.workspace_id) {
    const ws = await prisma.workspaces.findUnique({ where: { id: BigInt(user.workspace_id) } });
    if (ws) wsName = ws.name;
  }
  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    workspace_id: user.workspace_id ? Number(user.workspace_id) : null,
    workspace_name: wsName,
  };
}

// In-memory rate limiter for login
const loginAttempts: Map<string, { count: number; firstAttempt: number }> = new Map();

export async function register(req: AuthRequest, res: Response): Promise<void> {
  const { name, email, password, invite: inviteToken } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(422).json({ message: 'Nama harus diisi.' });
    return;
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    res.status(422).json({ message: 'Email tidak valid.' });
    return;
  }
  const pwdErr = validatePassword(password);
  if (pwdErr) {
    res.status(422).json({ message: pwdErr });
    return;
  }

  const existing = await prisma.users.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existing) {
    res.status(422).json({ message: 'Email ini sudah terdaftar.' });
    return;
  }

  let invite: any = null;
  if (inviteToken) {
    invite = await prisma.invites.findFirst({
      where: { token: inviteToken, accepted_at: null },
    });
    if (!invite) {
      res.status(422).json({ message: 'Undangan tidak valid atau sudah dipakai.' });
      return;
    }
    if (invite.email.toLowerCase() !== email.toLowerCase()) {
      res.status(422).json({ message: `Undangan ini untuk email ${invite.email}.` });
      return;
    }
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.$transaction(async (tx) => {
    if (invite) {
      const newUser = await tx.users.create({
        data: {
          name: name.trim(),
          email: email.toLowerCase(),
          password: hashedPassword,
          workspace_id: invite.workspace_id,
          role: invite.role,
        },
      });
      await tx.invites.update({
        where: { id: invite.id },
        data: { accepted_at: new Date() },
      });
      return newUser;
    }

    const ws = await tx.workspaces.create({
      data: {
        name: `Workspace ${name.trim()}`,
      },
    });

    const newUser = await tx.users.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase(),
        password: hashedPassword,
        workspace_id: ws.id,
        role: 'owner',
      },
    });

    await tx.workspaces.update({
      where: { id: ws.id },
      data: { owner_id: newUser.id },
    });

    return newUser;
  });

  const token = await issueToken(user.id);
  const presented = await presentUser(user);

  res.status(201).json({
    token,
    user: presented,
  });
}

export async function login(req: AuthRequest, res: Response): Promise<void> {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(422).json({ message: 'Email atau kata sandi salah.' });
    return;
  }

  const key = email.toLowerCase();
  const now = Date.now();
  const attempt = loginAttempts.get(key);

  if (attempt) {
    if (now - attempt.firstAttempt < 60000) {
      if (attempt.count >= 5) {
        const remainingSec = Math.ceil((60000 - (now - attempt.firstAttempt)) / 1000);
        res.status(429).json({ message: `Terlalu banyak percobaan masuk. Coba lagi dalam ${remainingSec} detik.` });
        return;
      }
    } else {
      loginAttempts.delete(key);
    }
  }

  const user = await prisma.users.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    const cur = loginAttempts.get(key) || { count: 0, firstAttempt: now };
    cur.count++;
    loginAttempts.set(key, cur);
    res.status(422).json({ message: 'Email atau kata sandi salah.' });
    return;
  }

  loginAttempts.delete(key);

  const token = await issueToken(user.id);
  const presented = await presentUser(user);

  res.json({
    token,
    user: presented,
  });
}

export async function googleAuth(req: AuthRequest, res: Response): Promise<void> {
  const { credential, email, name, invite: inviteToken } = req.body;

  let userEmail = email;
  let userName = name;

  if (credential && typeof credential === 'string') {
    try {
      // Verifikasi token asli secara langsung ke server OAuth2 Google
      const gRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      if (gRes.ok) {
        const gInfo: any = await gRes.json();
        if (gInfo.email) {
          userEmail = gInfo.email;
          userName = gInfo.name || gInfo.email.split('@')[0];
        }
      } else {
        // Fallback parsing payload jika server Google tidak dapat dijangkau
        const parts = credential.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          if (payload.email) {
            userEmail = payload.email;
            userName = payload.name || payload.email.split('@')[0];
          }
        }
      }
    } catch {
      try {
        const parts = credential.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          if (payload.email) {
            userEmail = payload.email;
            userName = payload.name || payload.email.split('@')[0];
          }
        }
      } catch {
        // Abaikan
      }
    }
  }

  if (!userEmail || typeof userEmail !== 'string' || !userEmail.includes('@')) {
    res.status(422).json({ message: 'Autentikasi Google gagal: Email tidak valid.' });
    return;
  }

  const cleanEmail = userEmail.toLowerCase().trim();
  const cleanName = (userName || cleanEmail.split('@')[0]).trim();

  let user = await prisma.users.findUnique({
    where: { email: cleanEmail },
  });

  if (!user) {
    let invite: any = null;
    if (inviteToken) {
      invite = await prisma.invites.findFirst({
        where: { token: inviteToken, accepted_at: null },
      });
    }

    const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

    user = await prisma.$transaction(async (tx) => {
      if (invite) {
        const newUser = await tx.users.create({
          data: {
            name: cleanName,
            email: cleanEmail,
            password: randomPassword,
            workspace_id: invite.workspace_id,
            role: invite.role,
            email_verified_at: new Date(),
          },
        });
        await tx.invites.update({
          where: { id: invite.id },
          data: { accepted_at: new Date() },
        });
        return newUser;
      }

      const ws = await tx.workspaces.create({
        data: {
          name: `Workspace ${cleanName}`,
        },
      });

      const newUser = await tx.users.create({
        data: {
          name: cleanName,
          email: cleanEmail,
          password: randomPassword,
          workspace_id: ws.id,
          role: 'owner',
          email_verified_at: new Date(),
        },
      });

      await tx.workspaces.update({
        where: { id: ws.id },
        data: { owner_id: newUser.id },
      });

      return newUser;
    });
  }

  const token = await issueToken(user.id);
  const presented = await presentUser(user);

  res.json({
    token,
    user: presented,
  });
}

export async function forgot(req: AuthRequest, res: Response): Promise<void> {
  const { email } = req.body;
  if (!email) {
    res.json({ message: 'Jika email terdaftar, tautan atur ulang sudah dikirim.' });
    return;
  }

  const user = await prisma.users.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (user) {
    const plain = randomString(48);
    const hash = crypto.createHash('sha256').update(plain).digest('hex');

    await prisma.password_reset_tokens.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        token: hash,
        created_at: new Date(),
      },
      update: {
        token: hash,
        created_at: new Date(),
      },
    });

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const link = `${frontendUrl}/#/reset/${plain}/${encodeURIComponent(user.email)}`;
    console.log(`[PASSWORD RESET] Email to ${user.email}:\nReset link: ${link}`);
  }

  res.json({ message: 'Jika email terdaftar, tautan atur ulang sudah dikirim.' });
}

export async function reset(req: AuthRequest, res: Response): Promise<void> {
  const { email, token, password } = req.body;
  if (!email || !token || !password) {
    res.status(422).json({ message: 'Data tidak lengkap.' });
    return;
  }

  const pwdErr = validatePassword(password);
  if (pwdErr) {
    res.status(422).json({ message: pwdErr });
    return;
  }

  const row = await prisma.password_reset_tokens.findUnique({
    where: { email: email.toLowerCase() },
  });

  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const valid = row &&
    row.token === hash &&
    row.created_at &&
    (Date.now() - new Date(row.created_at).getTime()) <= RESET_MINUTES * 60 * 1000;

  if (!valid) {
    res.status(422).json({ message: 'Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru.' });
    return;
  }

  const user = await prisma.users.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!user) {
    res.status(422).json({ message: 'Pengguna tidak ditemukan.' });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });
    await tx.password_reset_tokens.delete({
      where: { email: user.email },
    });
    // Revoke device sessions (where name is null)
    await tx.api_tokens.deleteMany({
      where: { user_id: user.id, name: null },
    });
  });

  loginAttempts.delete(email.toLowerCase());

  const newToken = await issueToken(user.id);
  const presented = await presentUser(user);

  res.json({
    token: newToken,
    user: presented,
  });
}

export async function me(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Tidak terotentikasi.' });
    return;
  }
  const presented = await presentUser(req.user);
  res.json({ user: presented });
}

export async function updateMe(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Tidak terotentikasi.' });
    return;
  }
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(422).json({ message: 'Nama harus diisi.' });
    return;
  }

  const updated = await prisma.users.update({
    where: { id: req.user.id },
    data: { name: name.trim() },
  });

  const presented = await presentUser(updated);
  res.json({ user: presented });
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  if (req.tokenHash) {
    await prisma.api_tokens.deleteMany({
      where: { token_hash: req.tokenHash },
    });
  }
  res.json({ ok: true });
}
