import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Response } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../types';
import { isStr } from '../validation';
import { getPaymentSettings, isPaymentConfigured, publicPaymentInfo, sniffProof } from '../services/paymentSettings';
import { PAYMENT_TTL_HOURS, PROOF_MAX_BYTES, metaOf, presentPayment, statusOf } from '../services/payments';
import { LIMITS, MONTHS_CHARGED, PLAN_LABEL, PLAN_RUNTIME, PRICE_PER_USER_MONTH, atLeast, isActiveProject, quote } from '../services/plans';
import type { PaidPlan, Period } from '../services/plans';
import { activeProjectCount, memberCount, planOf } from '../services/workspacePlan';
import { broadcastSync } from '../socket';

const isOwner = (u: AuthRequest['user']) => !!u && (u.role === 'owner' || u.role === 'superadmin');
const isAdmin = (u: AuthRequest['user']) => !!u && (u.role === 'owner' || u.role === 'admin' || u.role === 'superadmin');

export const proofDir = path.join(__dirname, '../../uploads/proofs');
fs.mkdirSync(proofDir, { recursive: true });

const PROOF_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']);
export const proofMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, proofDir),
    filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: PROOF_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => (PROOF_EXT.has(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('TIPE_FILE_DITOLAK'))),
});

/** Kirim berkas bukti dengan header aman (tidak pernah dieksekusi; gambar/PDF boleh tampil). */
export function sendProof(res: Response, stored: string, name: string | null): void {
  const file = path.join(proofDir, path.basename(stored));
  if (!fs.existsSync(file)) {
    res.status(404).json({ message: 'Bukti pembayaran tidak ditemukan.' });
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg');
  res.setHeader('Content-Disposition', `inline; filename="${(name ?? 'bukti').replace(/[^\w.\- ]/g, '_')}"`);
  res.sendFile(file);
}

const removeProof = (stored: string | null) => {
  if (stored) fs.rmSync(path.join(proofDir, path.basename(stored)), { force: true });
};

/** Ringkasan paket, harga, pemakaian, tujuan pembayaran, dan riwayat tagihan. */
export async function getBilling(req: AuthRequest, res: Response): Promise<void> {
  const wsId = req.user!.workspace_id!;
  const p = await planOf(wsId);
  const settings = await getPaymentSettings();
  const [seats, projects, storage, recent] = await Promise.all([
    memberCount(wsId),
    activeProjectCount(wsId),
    prisma.uploads.aggregate({ where: { workspace_id: wsId }, _sum: { size: true } }),
    prisma.payments.findMany({ where: { workspace_id: wsId, kind: 'plan' }, orderBy: { id: 'desc' }, take: 10 }),
  ]);
  const history = recent.map(presentPayment);
  // Tagihan aktif = yang terbaru dan masih bisa diproses (menunggu transfer / menunggu verifikasi).
  const open = history.find((h) => h.status === 'pending' || h.status === 'submitted') ?? null;

  res.json({
    plan: p.plan,
    planUntil: p.plan === 'gratis' ? null : p.until?.toISOString() ?? null,
    expired: p.stored !== 'gratis' && p.plan === 'gratis',
    trialAvailable: PLAN_RUNTIME.trialDays > 0 && !p.trialUsed && !atLeast(p.plan, 'pro'),
    trialDays: PLAN_RUNTIME.trialDays,
    seats,
    prices: PRICE_PER_USER_MONTH,
    periods: MONTHS_CHARGED,
    limits: LIMITS[p.plan],
    usage: {
      members: seats,
      activeProjects: [...projects.values()].filter(isActiveProject).length,
      storageBytes: Number(storage._sum.size ?? 0),
    },
    paymentsConfigured: isPaymentConfigured(settings),
    paymentInfo: publicPaymentInfo(settings),
    paymentTtlHours: PAYMENT_TTL_HOURS,
    canPurchase: isOwner(req.user),
    pending: open,
    history,
  });
}

/** Pilih kode unik 1–999 yang belum dipakai tagihan aktif lain dengan nominal dasar yang sama. */
async function pickUniqueCode(base: number): Promise<number> {
  const active = await prisma.payments.findMany({
    where: { kind: 'plan', status: { in: ['pending', 'submitted'] }, base_amount: BigInt(base) },
    select: { unique_code: true },
  });
  const used = new Set(active.map((a) => a.unique_code));
  for (let i = 0; i < 50; i++) {
    const code = crypto.randomInt(1, 1000);
    if (!used.has(code)) return code;
  }
  return crypto.randomInt(1, 1000);
}

export async function checkout(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user!;
  if (!isOwner(user)) {
    res.status(403).json({ message: 'Hanya pemilik workspace yang dapat membeli paket.' });
    return;
  }
  const plan = req.body?.plan;
  const period = req.body?.period;
  if (plan !== 'pro' && plan !== 'bisnis') {
    res.status(422).json({ message: 'Paket harus pro atau bisnis. Enterprise melalui negosiasi.' });
    return;
  }
  if (period !== 'monthly' && period !== 'yearly') {
    res.status(422).json({ message: 'Periode harus bulanan atau tahunan.' });
    return;
  }
  const settings = await getPaymentSettings();
  if (!isPaymentConfigured(settings)) {
    res.status(503).json({ configured: false, message: 'Metode pembayaran belum diatur oleh administrator sistem. Paket belum bisa dibeli; hubungi administrator.' });
    return;
  }

  const wsId = user.workspace_id!;
  const q = quote(plan as PaidPlan, period as Period, await memberCount(wsId));
  const meta = { plan, period, seats: q.seats, months: q.months, pricePerUserMonth: q.pricePerUserMonth };

  // Pakai ulang tagihan yang masih aktif untuk pembelian yang sama persis.
  const open = await prisma.payments.findMany({ where: { workspace_id: wsId, kind: 'plan', status: { in: ['pending', 'submitted'] }, base_amount: BigInt(q.amount) }, orderBy: { id: 'desc' } });
  const same = open.find((p) => {
    const m = metaOf(p);
    return statusOf(p) !== 'expired' && m.plan === plan && m.period === period && m.seats === q.seats;
  });
  if (same) {
    res.json(presentPayment(same));
    return;
  }

  const code = settings.uniqueCode ? await pickUniqueCode(q.amount) : 0;
  const orderId = `RMP-${wsId}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const pay = await prisma.payments.create({
    data: {
      workspace_id: wsId, kind: 'plan', invoice_rid: `plan:${plan}:${period}`, order_id: orderId,
      amount: BigInt(q.amount + code), base_amount: BigInt(q.amount), unique_code: code,
      expires_at: new Date(Date.now() + PAYMENT_TTL_HOURS * 3600_000), created_by: user.id, meta: JSON.stringify(meta),
    },
  });
  res.status(201).json(presentPayment(pay));
}

async function ownPayment(req: AuthRequest) {
  return prisma.payments.findFirst({ where: { workspace_id: req.user!.workspace_id!, kind: 'plan', order_id: String(req.params.orderId).slice(0, 50) } });
}

export async function paymentStatus(req: AuthRequest, res: Response): Promise<void> {
  const pay = await ownPayment(req);
  if (!pay) {
    res.status(404).json({ message: 'Pembayaran tidak ditemukan.' });
    return;
  }
  res.json(presentPayment(pay));
}

/** Pembeli mengunggah bukti transfer; tagihan berpindah ke "menunggu verifikasi". */
export async function submitProof(req: AuthRequest, res: Response): Promise<void> {
  const file = req.file;
  const cleanup = () => file && fs.rmSync(file.path, { force: true });
  if (!isOwner(req.user)) {
    cleanup();
    res.status(403).json({ message: 'Hanya pemilik workspace yang dapat mengunggah bukti pembayaran.' });
    return;
  }
  const pay = await ownPayment(req);
  if (!pay) {
    cleanup();
    res.status(404).json({ message: 'Pembayaran tidak ditemukan.' });
    return;
  }
  if (pay.status !== 'pending' && pay.status !== 'submitted') {
    cleanup();
    res.status(409).json({ message: pay.status === 'paid' ? 'Pembayaran ini sudah diverifikasi.' : 'Tagihan ini sudah ditolak. Buat tagihan baru.' });
    return;
  }
  if (!file) {
    res.status(422).json({ message: 'Pilih berkas bukti transfer (gambar atau PDF, maks 5 MB).' });
    return;
  }
  // Pastikan isi berkas sesuai (bukan sekadar ekstensi).
  const head = Buffer.alloc(16);
  const fd = fs.openSync(file.path, 'r');
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  if (!sniffProof(head)) {
    cleanup();
    res.status(422).json({ message: 'Berkas bukan gambar (PNG/JPG/WebP) atau PDF yang valid.' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const method = body.method === 'qris' || body.method === 'bank' ? body.method : undefined;
  const senderName = isStr(body.senderName) ? body.senderName.trim().slice(0, 100) : '';
  const note = isStr(body.note) ? body.note.trim().slice(0, 300) : '';
  const meta = { ...metaOf(pay), transfer: { method, senderName, note } };

  removeProof(pay.proof_file);
  const updated = await prisma.payments.update({
    where: { id: pay.id },
    data: { status: 'submitted', proof_file: file.filename, proof_name: file.originalname.slice(0, 255), submitted_at: new Date(), meta: JSON.stringify(meta) },
  });
  res.json(presentPayment(updated));
}

export async function getOwnProof(req: AuthRequest, res: Response): Promise<void> {
  const pay = await ownPayment(req);
  if (!pay?.proof_file) {
    res.status(404).json({ message: 'Bukti pembayaran tidak ditemukan.' });
    return;
  }
  sendProof(res, pay.proof_file, pay.proof_name);
}

/** Batalkan tagihan yang belum diverifikasi (mis. salah memilih paket). */
export async function cancelPayment(req: AuthRequest, res: Response): Promise<void> {
  if (!isOwner(req.user)) {
    res.status(403).json({ message: 'Hanya pemilik workspace yang dapat membatalkan tagihan.' });
    return;
  }
  const pay = await ownPayment(req);
  if (!pay) {
    res.status(404).json({ message: 'Pembayaran tidak ditemukan.' });
    return;
  }
  if (pay.status !== 'pending') {
    res.status(409).json({ message: pay.status === 'submitted' ? 'Bukti sudah dikirim dan sedang diverifikasi; tagihan tidak bisa dibatalkan.' : 'Tagihan ini sudah selesai diproses.' });
    return;
  }
  await prisma.payments.update({ where: { id: pay.id }, data: { status: 'expired', expires_at: new Date() } });
  res.json({ ok: true });
}

/** Uji coba Pro 14 hari, sekali per workspace. */
export async function startTrial(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user!;
  if (!isAdmin(user)) {
    res.status(403).json({ message: 'Hanya pemilik atau admin yang dapat memulai uji coba.' });
    return;
  }
  const wsId = user.workspace_id!;
  const p = await planOf(wsId);
  if (PLAN_RUNTIME.trialDays <= 0) {
    res.status(409).json({ message: 'Uji coba sedang tidak tersedia.' });
    return;
  }
  if (p.trialUsed) {
    res.status(409).json({ message: 'Uji coba sudah pernah dipakai di workspace ini.' });
    return;
  }
  if (atLeast(p.plan, 'pro')) {
    res.status(409).json({ message: `Workspace sudah memakai paket ${PLAN_LABEL[p.plan]}.` });
    return;
  }
  const until = new Date(Date.now() + PLAN_RUNTIME.trialDays * 864e5);
  const ws = await prisma.workspaces.update({ where: { id: wsId }, data: { plan: 'pro', plan_until: until, trial_used: true, rev: { increment: 1 } } });
  broadcastSync(Number(wsId), { rev: Number(ws.rev), senderId: Number(user.id), applied: 0 });
  res.json({ plan: 'pro', planUntil: until.toISOString(), trial: true });
}
