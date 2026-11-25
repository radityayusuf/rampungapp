import { Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../db';
import { AuthRequest } from '../types';
import { verifyGoogleCredential } from '../google';
import { emailLayout, escapeHtml, sendMail } from '../mail';
import { isStr, parseEmail, parseName } from '../validation';
import { isSuperadminUser } from '../superadmin';
import { memberLimitError } from '../services/workspacePlan';

export const RESET_MINUTES = 60;

function validatePassword(password: unknown): string | null {
  if (!isStr(password)) {
    return 'Kata sandi harus berupa teks.';
  }
  if (password.length > 200) {
    return 'Kata sandi terlalu panjang.';
  }
  if (password.length < 8) {
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
    is_superadmin: isSuperadminUser(user),
  };
}

export async function register(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body ?? {};
  const name = parseName(body.name);
  const email = parseEmail(body.email);
  const password = body.password;
  const inviteToken = body.invite;

  if (!name) {
    res.status(422).json({ message: 'Nama harus diisi (maksimal 100 karakter).' });
    return;
  }
  if (!email) {
    res.status(422).json({ message: 'Email tidak valid.' });
    return;
  }
  const pwdErr = validatePassword(password);
  if (pwdErr) {
    res.status(422).json({ message: pwdErr });
    return;
  }
  if (inviteToken !== undefined && inviteToken !== null && inviteToken !== '' && !isStr(inviteToken)) {
    res.status(422).json({ message: 'Undangan tidak valid atau sudah dipakai.' });
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
    const limit = await memberLimitError(invite.workspace_id, 1, false);
    if (limit) {
      res.status(402).json({ message: limit });
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
  }).catch((e: { code?: string }) => {
    // Dua pendaftaran serentak dengan email sama: yang kalah kena batasan unik di database.
    if (e?.code === 'P2002') return null;
    throw e;
  });

  if (!user) {
    res.status(422).json({ message: 'Email ini sudah terdaftar.' });
    return;
  }

  const token = await issueToken(user.id);
  const presented = await presentUser(user);

  res.status(201).json({
    token,
    user: presented,
  });
}

export async function login(req: AuthRequest, res: Response): Promise<void> {
  const email = parseEmail(req.body?.email);
  const password = req.body?.password;
  const fail = () => res.status(422).json({ message: 'Email atau kata sandi salah.' });

  if (!email || !isStr(password) || password.length === 0 || password.length > 200) {
    fail();
    return;
  }

  // Pembatasan percobaan (per IP dan per akun) dilakukan oleh middleware di rateLimit.ts.
  const user = await prisma.users.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    fail();
    return;
  }

  const token = await issueToken(user.id);
  const presented = await presentUser(user);

  res.json({
    token,
    user: presented,
  });
}

export async function googleAuth(req: AuthRequest, res: Response): Promise<void> {
  const { credential, invite: inviteToken } = req.body ?? {};

  // Hanya ID token Google asli yang diterima. Email/nama dari body TIDAK dipercaya.
  if (typeof credential !== 'string' || credential.length < 20 || credential.length > 4096) {
    res.status(422).json({ message: 'Kredensial Google diperlukan.' });
    return;
  }

  const verified = await verifyGoogleCredential(credential);
  if (!verified.ok) {
    res.status(verified.status).json({ message: verified.message });
    return;
  }

  const cleanEmail = verified.email.toLowerCase().trim();
  const cleanName = verified.name.trim().slice(0, 100) || cleanEmail.split('@')[0].slice(0, 100);

  let user = await prisma.users.findUnique({ where: { email: cleanEmail } });

  if (!user) {
    let invite: { id: bigint; workspace_id: bigint; role: string; email: string } | null = null;
    if (typeof inviteToken === 'string' && inviteToken) {
      invite = await prisma.invites.findFirst({ where: { token: inviteToken, accepted_at: null } });
      if (!invite) {
        res.status(422).json({ message: 'Undangan tidak valid atau sudah dipakai.' });
        return;
      }
      if (invite.email.toLowerCase() !== cleanEmail) {
        res.status(422).json({ message: `Undangan ini untuk email ${invite.email}.` });
        return;
      }
      const limit = await memberLimitError(invite.workspace_id, 1, false);
      if (limit) {
        res.status(402).json({ message: limit });
        return;
      }
    }

    const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

    user = await prisma.$transaction(async (tx) => {
      if (invite) {
        const newUser = await tx.users.create({
          data: { name: cleanName, email: cleanEmail, password: randomPassword, workspace_id: invite.workspace_id, role: invite.role, email_verified_at: new Date() },
        });
        await tx.invites.update({ where: { id: invite.id }, data: { accepted_at: new Date() } });
        return newUser;
      }

      const ws = await tx.workspaces.create({ data: { name: `Workspace ${cleanName}` } });
      const newUser = await tx.users.create({
        data: { name: cleanName, email: cleanEmail, password: randomPassword, workspace_id: ws.id, role: 'owner', email_verified_at: new Date() },
      });
      await tx.workspaces.update({ where: { id: ws.id }, data: { owner_id: newUser.id } });
      return newUser;
    });
  } else if (!user.email_verified_at) {
    // Akun dibuat lewat email+sandi tanpa verifikasi, lalu pemilik email asli masuk lewat Google.
    // Anggap pendaftar awal tidak dipercaya: ganti sandi dan cabut semua sesi perangkat.
    const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    const [updated] = await prisma.$transaction([
      prisma.users.update({ where: { id: user.id }, data: { password: randomPassword, email_verified_at: new Date() } }),
      prisma.api_tokens.deleteMany({ where: { user_id: user.id, name: null } }),
    ]);
    user = updated;
  }

  const token = await issueToken(user.id);
  const presented = await presentUser(user);

  res.json({
    token,
    user: presented,
  });
}

export async function forgot(req: AuthRequest, res: Response): Promise<void> {
  const email = parseEmail(req.body?.email);
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
    // Tidak ditunggu: waktu respons tidak boleh membedakan email terdaftar dan tidak.
    void sendMail(
      user.email,
      'Atur ulang kata sandi Rampung',
      `Halo ${user.name},\n\nKami menerima permintaan mengatur ulang kata sandi akun Rampung Anda.\n\nBuka tautan berikut (berlaku ${RESET_MINUTES} menit):\n${link}\n\nAbaikan email ini jika Anda tidak memintanya.\n\nSalam,\nTim Rampung`,
      emailLayout({
        preheader: 'Tautan untuk mengatur ulang kata sandi Rampung Anda.',
        title: 'Atur ulang kata sandi',
        bodyHtml: `<p style="margin:0 0 12px;">Halo <b>${escapeHtml(user.name)}</b>,</p><p style="margin:0;">Kami menerima permintaan untuk mengatur ulang kata sandi akun Rampung Anda. Klik tombol di bawah untuk membuat kata sandi baru. Tautan berlaku <b>${RESET_MINUTES} menit</b>.</p>`,
        buttonText: 'Buat kata sandi baru',
        buttonUrl: link,
        footnote: 'Tidak merasa meminta ini? Abaikan email ini — kata sandi Anda tidak berubah.',
      }),
    ).then((ok) => { if (!ok) console.log(`[PASSWORD RESET] SMTP belum dikonfigurasi/gagal. Tautan untuk ${user.email}: ${link}`); });
  }

  res.json({ message: 'Jika email terdaftar, tautan atur ulang sudah dikirim.' });
}

export async function reset(req: AuthRequest, res: Response): Promise<void> {
  const email = parseEmail(req.body?.email);
  const { token, password } = req.body ?? {};
  if (!email || !isStr(token) || token.length === 0 || token.length > 200 || !isStr(password)) {
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
  const name = parseName(req.body?.name);
  if (!name) {
    res.status(422).json({ message: 'Nama harus diisi (maksimal 100 karakter).' });
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
