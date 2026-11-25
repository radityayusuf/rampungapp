import multer from 'multer';
import ExcelJS from 'exceljs';
import { Response } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../types';
import { isSuperadminUser } from '../superadmin';
import { isStr, parseId } from '../validation';
import {
  QRIS_MAX_BYTES, getPaymentSettings, isPaymentConfigured, parseSettingsInput, savePaymentSettings, sniffImage,
} from '../services/paymentSettings';
import { approvePayment, metaOf, rejectPayment, statusOf } from '../services/payments';
import type { PaymentRow, PaymentStatus } from '../services/payments';
import { PLAN_LABEL } from '../services/plans';
import { sendProof } from './billing';
import { DEFAULT_PLAN_CONFIG, getPlanConfig, parsePlanConfig, savePlanConfig } from '../services/planConfig';

const deny = (res: Response) => res.status(403).json({ message: 'Akses ditolak: hanya Administrator Sistem.' });
const guard = (req: AuthRequest, res: Response): boolean => {
  if (isSuperadminUser(req.user)) return true;
  deny(res);
  return false;
};

export const qrisMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: QRIS_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => (/\.(png|jpe?g|webp)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('TIPE_FILE_DITOLAK'))),
});

// ─── Pengaturan tujuan pembayaran ───

export async function getSettings(req: AuthRequest, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  const s = await getPaymentSettings();
  res.json({ ...s, configured: isPaymentConfigured(s) });
}

export async function putSettings(req: AuthRequest, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  const current = await getPaymentSettings();
  const parsed = parseSettingsInput(req.body, current);
  if ('error' in parsed) {
    res.status(422).json({ message: parsed.error });
    return;
  }
  await savePaymentSettings(parsed.value, req.user!.id);
  res.json({ ...parsed.value, configured: isPaymentConfigured(parsed.value) });
}

export async function putQris(req: AuthRequest, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  const file = req.file;
  if (!file) {
    res.status(422).json({ message: 'Pilih gambar QRIS (PNG, JPG, atau WebP, maks 1 MB).' });
    return;
  }
  const mime = sniffImage(file.buffer);
  if (!mime) {
    res.status(422).json({ message: 'Berkas bukan gambar PNG/JPG/WebP yang valid.' });
    return;
  }
  const s = await getPaymentSettings();
  s.qrisImage = `data:${mime};base64,${file.buffer.toString('base64')}`;
  await savePaymentSettings(s, req.user!.id);
  res.json({ ...s, configured: true });
}

export async function deleteQris(req: AuthRequest, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  const s = await getPaymentSettings();
  s.qrisImage = null;
  await savePaymentSettings(s, req.user!.id);
  res.json({ ...s, configured: isPaymentConfigured(s) });
}

// ─── Daftar & verifikasi pembayaran ───

const STATUSES: PaymentStatus[] = ['pending', 'submitted', 'paid', 'rejected', 'expired'];
export const STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Menunggu pembayaran', submitted: 'Menunggu verifikasi', paid: 'Lunas', rejected: 'Ditolak', expired: 'Kedaluwarsa',
};

/** "YYYY-MM-DD" dalam WIB → awal/akhir hari. */
function dayBound(v: unknown, end: boolean): Date | null {
  if (!isStr(v) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T${end ? '23:59:59.999' : '00:00:00.000'}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface Filters {
  where: Record<string, unknown>;
  status: PaymentStatus | null;
}

async function buildFilters(q: Record<string, unknown>): Promise<Filters> {
  const where: Record<string, unknown> = { kind: 'plan' };
  const status = isStr(q.status) && (STATUSES as string[]).includes(q.status) ? (q.status as PaymentStatus) : null;
  const now = new Date();
  // "expired" efektif = pending yang lewat batas atau yang dibatalkan (status expired di database).
  if (status === 'pending') Object.assign(where, { status: 'pending', expires_at: { gt: now } });
  else if (status === 'expired') where.OR = [{ status: 'expired' }, { status: 'pending', expires_at: { lte: now } }];
  else if (status) where.status = status;

  const field = q.basis === 'paid' ? 'paid_at' : 'created_at';
  const from = dayBound(q.from, false);
  const to = dayBound(q.to, true);
  if (from || to) where[field] = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

  if (isStr(q.q) && q.q.trim()) {
    const term = q.q.trim().slice(0, 100);
    const [wss, users] = await Promise.all([
      prisma.workspaces.findMany({ where: { name: { contains: term } }, select: { id: true }, take: 200 }),
      prisma.users.findMany({ where: { OR: [{ email: { contains: term } }, { name: { contains: term } }] }, select: { id: true }, take: 200 }),
    ]);
    const and = (where.AND as unknown[]) ?? [];
    and.push({ OR: [{ order_id: { contains: term } }, { workspace_id: { in: wss.map((w) => w.id) } }, { created_by: { in: users.map((u) => u.id) } }] });
    where.AND = and;
  }
  return { where, status };
}

async function decorate(rows: PaymentRow[]) {
  const wsIds = [...new Set(rows.map((r) => r.workspace_id))];
  const userIds = [...new Set(rows.flatMap((r) => [r.created_by, r.reviewed_by]).filter((v): v is bigint => v !== null))];
  const [wss, users] = await Promise.all([
    prisma.workspaces.findMany({ where: { id: { in: wsIds } }, select: { id: true, name: true } }),
    prisma.users.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
  ]);
  const ws = new Map(wss.map((w) => [w.id, w.name]));
  const us = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => {
    const m = metaOf(r);
    const buyer = r.created_by ? us.get(r.created_by) : undefined;
    const reviewer = r.reviewed_by ? us.get(r.reviewed_by) : undefined;
    const status = statusOf(r);
    return {
      id: Number(r.id),
      orderId: r.order_id,
      workspaceId: Number(r.workspace_id),
      workspaceName: ws.get(r.workspace_id) ?? '(workspace dihapus)',
      buyerName: buyer?.name ?? '-',
      buyerEmail: buyer?.email ?? '-',
      plan: m.plan ?? '-',
      period: m.period ?? '-',
      seats: m.seats ?? 0,
      months: m.months ?? 0,
      baseAmount: r.base_amount !== null ? Number(r.base_amount) : Number(r.amount),
      uniqueCode: r.unique_code ?? 0,
      amount: Number(r.amount),
      status,
      statusLabel: STATUS_LABEL[status],
      method: m.transfer?.method ?? '',
      senderName: m.transfer?.senderName ?? '',
      buyerNote: m.transfer?.note ?? '',
      hasProof: !!r.proof_file,
      proofName: r.proof_name,
      createdAt: r.created_at?.toISOString() ?? null,
      submittedAt: r.submitted_at?.toISOString() ?? null,
      reviewedAt: r.reviewed_at?.toISOString() ?? null,
      paidAt: r.paid_at?.toISOString() ?? null,
      reviewerName: reviewer?.name ?? '',
      reviewNote: r.review_note ?? '',
    };
  });
}

async function summarize(where: Record<string, unknown>) {
  const rows = await prisma.payments.findMany({ where, select: { status: true, expires_at: true, amount: true } });
  const out = { total: rows.length, paidCount: 0, paidAmount: 0, awaitingReview: 0, pending: 0, rejected: 0, expired: 0 };
  for (const r of rows) {
    const st = statusOf(r);
    if (st === 'paid') {
      out.paidCount++;
      out.paidAmount += Number(r.amount);
    } else if (st === 'submitted') out.awaitingReview++;
    else if (st === 'pending') out.pending++;
    else if (st === 'rejected') out.rejected++;
    else out.expired++;
  }
  return out;
}

export async function listPayments(req: AuthRequest, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  const { where } = await buildFilters(req.query);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const page = Math.max(1, Number(req.query.page) || 1);
  const [total, rows, summary, review] = await Promise.all([
    prisma.payments.count({ where }),
    prisma.payments.findMany({ where, orderBy: [{ id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    summarize(where),
    prisma.payments.count({ where: { kind: 'plan', status: 'submitted' } }),
  ]);
  res.json({ items: await decorate(rows), total, page, pageSize, summary, awaitingReviewAll: review });
}

export async function paymentProof(req: AuthRequest, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  const id = parseId(req.params.id);
  const pay = id ? await prisma.payments.findUnique({ where: { id } }) : null;
  if (!pay?.proof_file) {
    res.status(404).json({ message: 'Bukti pembayaran tidak ditemukan.' });
    return;
  }
  sendProof(res, pay.proof_file, pay.proof_name);
}

export async function approve(req: AuthRequest, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) return void res.status(404).json({ message: 'Pembayaran tidak ditemukan.' });
  const note = isStr(req.body?.note) ? req.body.note.trim() : undefined;
  const r = await approvePayment(id, req.user!.id, note);
  if (!r.ok) return void res.status(r.code).json({ message: r.message });
  res.json({ ok: true, item: (await decorate([r.pay]))[0] });
}

export async function reject(req: AuthRequest, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) return void res.status(404).json({ message: 'Pembayaran tidak ditemukan.' });
  const note = isStr(req.body?.note) ? req.body.note.trim() : '';
  if (note.length < 3) return void res.status(422).json({ message: 'Alasan penolakan wajib diisi agar pembeli tahu apa yang perlu diperbaiki.' });
  const r = await rejectPayment(id, req.user!.id, note);
  if (!r.ok) return void res.status(r.code).json({ message: r.message });
  res.json({ ok: true, item: (await decorate([r.pay]))[0] });
}

// ─── Ekspor laporan ───

type Row = Awaited<ReturnType<typeof decorate>>[number];

const wib = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '');
const PERIOD_LABEL: Record<string, string> = { monthly: 'Bulanan', yearly: 'Tahunan' };
const METHOD_LABEL: Record<string, string> = { qris: 'QRIS', bank: 'Transfer rekening' };

const COLUMNS: { header: string; width: number; value: (r: Row) => string | number }[] = [
  { header: 'No. Pesanan', width: 22, value: (r) => r.orderId },
  { header: 'Dibuat (WIB)', width: 17, value: (r) => wib(r.createdAt) },
  { header: 'Workspace', width: 28, value: (r) => r.workspaceName },
  { header: 'Pembeli', width: 24, value: (r) => r.buyerName },
  { header: 'Email', width: 28, value: (r) => r.buyerEmail },
  { header: 'Paket', width: 12, value: (r) => PLAN_LABEL[r.plan as keyof typeof PLAN_LABEL] ?? r.plan },
  { header: 'Periode', width: 10, value: (r) => PERIOD_LABEL[r.period] ?? r.period },
  { header: 'Anggota saat beli', width: 15, value: (r) => r.seats },
  { header: 'Harga Paket (Rp)', width: 16, value: (r) => r.baseAmount },
  { header: 'Kode Unik', width: 10, value: (r) => r.uniqueCode },
  { header: 'Total Tagihan (Rp)', width: 18, value: (r) => r.amount },
  { header: 'Status', width: 20, value: (r) => r.statusLabel },
  { header: 'Metode', width: 17, value: (r) => METHOD_LABEL[r.method] ?? '' },
  { header: 'Nama Pengirim', width: 22, value: (r) => r.senderName },
  { header: 'Bukti Diunggah (WIB)', width: 19, value: (r) => wib(r.submittedAt) },
  { header: 'Diverifikasi (WIB)', width: 18, value: (r) => wib(r.reviewedAt) },
  { header: 'Diverifikasi Oleh', width: 20, value: (r) => r.reviewerName },
  { header: 'Catatan Verifikasi', width: 30, value: (r) => r.reviewNote },
];

/** Cegah injeksi rumus di Excel/Sheets: sel teks yang diawali = + - @ diberi awalan apostrof. */
const safeText = (v: string | number): string | number => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const csvCell = (v: string | number) => {
  const s = String(safeText(v));
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function monthly(rows: Row[]) {
  const map = new Map<string, { month: string; plan: string; count: number; amount: number }>();
  for (const r of rows) {
    if (r.status !== 'paid' || !r.paidAt) continue;
    const month = wib(r.paidAt).slice(0, 7);
    const plan = PLAN_LABEL[r.plan as keyof typeof PLAN_LABEL] ?? r.plan;
    const k = `${month}|${plan}`;
    const cur = map.get(k) ?? { month, plan, count: 0, amount: 0 };
    cur.count++;
    cur.amount += r.amount;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => (a.month === b.month ? a.plan.localeCompare(b.plan) : a.month.localeCompare(b.month)));
}

export async function exportPayments(req: AuthRequest, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  const { where } = await buildFilters(req.query);
  const rows = await decorate(await prisma.payments.findMany({ where, orderBy: { id: 'desc' }, take: 20000 }));
  const stamp = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

  if (req.query.format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Rampung';
    wb.created = new Date();
    const ws = wb.addWorksheet('Pembayaran', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F9D8A' } };
    for (const r of rows) ws.addRow(COLUMNS.map((c) => safeText(c.value(r))));
    for (const key of ['I', 'J', 'K']) ws.getColumn(key).numFmt = '#,##0';
    ws.autoFilter = { from: 'A1', to: { row: 1, column: COLUMNS.length } };

    const sum = wb.addWorksheet('Ringkasan');
    const paid = rows.filter((r) => r.status === 'paid');
    sum.addRow(['Laporan pembayaran paket Rampung']).font = { bold: true, size: 14 };
    sum.addRow([`Dibuat ${wib(new Date().toISOString())} WIB · ${rows.length} transaksi`]);
    sum.addRow([]);
    sum.addRow(['Total pendapatan (lunas)', paid.reduce((s, r) => s + r.amount, 0)]);
    sum.addRow(['Jumlah transaksi lunas', paid.length]);
    for (const st of STATUSES) sum.addRow([`Status: ${STATUS_LABEL[st]}`, rows.filter((r) => r.status === st).length]);
    sum.addRow([]);
    const head = sum.addRow(['Bulan (tgl. lunas)', 'Paket', 'Transaksi', 'Pendapatan (Rp)']);
    head.font = { bold: true };
    for (const m of monthly(rows)) sum.addRow([m.month, m.plan, m.count, m.amount]);
    sum.columns = [{ width: 28 }, { width: 14 }, { width: 12 }, { width: 18 }];
    sum.getColumn(4).numFmt = '#,##0';
    sum.getCell('B4').numFmt = '#,##0';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-pembayaran-${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
    return;
  }

  // CSV: BOM agar Excel membaca UTF-8; pemisah koma.
  const lines = [COLUMNS.map((c) => csvCell(c.header)).join(','), ...rows.map((r) => COLUMNS.map((c) => csvCell(c.value(r))).join(','))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="laporan-pembayaran-${stamp}.csv"`);
  res.send('﻿' + lines.join('\r\n') + '\r\n');
}

// ─── Paket & batas (dapat diubah) ───

export async function getPlans(req: AuthRequest, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  res.json({ config: getPlanConfig(), defaults: DEFAULT_PLAN_CONFIG });
}

export async function putPlans(req: AuthRequest, res: Response): Promise<void> {
  if (!guard(req, res)) return;
  const parsed = parsePlanConfig(req.body);
  if ('error' in parsed) {
    res.status(422).json({ message: parsed.error });
    return;
  }
  await savePlanConfig(parsed.value, req.user!.id);
  res.json({ config: getPlanConfig() });
}
