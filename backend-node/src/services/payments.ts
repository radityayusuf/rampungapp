import { prisma } from '../db';
import { broadcastSync } from '../socket';
import { addMonths, effectivePlan, isPlan } from './plans';

export type PaymentRow = NonNullable<Awaited<ReturnType<typeof prisma.payments.findUnique>>>;

/** Tagihan paket berlaku 48 jam sejak dibuat; setelah itu "kedaluwarsa" kecuali bukti sudah diunggah. */
export const PAYMENT_TTL_HOURS = 48;
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

export type PaymentStatus = 'pending' | 'submitted' | 'paid' | 'rejected' | 'expired';

/** Status efektif: "pending" yang lewat batas waktu dianggap "expired" tanpa perlu tugas terjadwal. */
export function statusOf(p: { status: string; expires_at: Date | null }, now = new Date()): PaymentStatus {
  if (p.status === 'pending' && p.expires_at && p.expires_at <= now) return 'expired';
  return p.status as PaymentStatus;
}

export interface PlanMeta {
  plan?: string;
  period?: string;
  seats?: number;
  months?: number;
  pricePerUserMonth?: number; // tagihan lama (per pengguna)
  /** Tagihan baru: harga tetap per paket. */
  pricePerMonth?: number;
  flat?: boolean;
  memberLimit?: number | null;
  transfer?: { method?: string; senderName?: string; note?: string };
}

export function metaOf(p: { meta: string | null }): PlanMeta {
  try {
    return JSON.parse(p.meta ?? '{}') as PlanMeta;
  } catch {
    return {};
  }
}

/** Bentuk yang dikirim ke pemilik workspace (tanpa nama berkas internal). */
export const presentPayment = (p: PaymentRow) => ({
  orderId: p.order_id,
  status: statusOf(p),
  amount: Number(p.amount),
  baseAmount: p.base_amount !== null ? Number(p.base_amount) : Number(p.amount),
  uniqueCode: p.unique_code ?? 0,
  expiresAt: p.expires_at?.toISOString() ?? null,
  createdAt: p.created_at?.toISOString() ?? null,
  submittedAt: p.submitted_at?.toISOString() ?? null,
  paidAt: p.paid_at?.toISOString() ?? null,
  reviewedAt: p.reviewed_at?.toISOString() ?? null,
  reviewNote: p.status === 'rejected' ? p.review_note : null,
  hasProof: !!p.proof_file,
  proofName: p.proof_name,
  meta: metaOf(p),
});

export type ApproveResult = { ok: true; pay: PaymentRow } | { ok: false; code: 404 | 409; message: string };

/**
 * Setujui pembayaran paket (oleh superadmin) secara atomik dan idempoten:
 * status berubah hanya dari pending/submitted, paket workspace naik atau diperpanjang,
 * dan nomor rev dinaikkan agar semua anggota menarik paket baru.
 */
export async function approvePayment(id: bigint, reviewerId: bigint, note?: string): Promise<ApproveResult> {
  const out = await prisma.$transaction(async (tx) => {
    const pay = await tx.payments.findUnique({ where: { id } });
    if (!pay || pay.kind !== 'plan') return { ok: false as const, code: 404 as const, message: 'Pembayaran tidak ditemukan.' };

    const now = new Date();
    const claimed = await tx.payments.updateMany({
      where: { id, status: { in: ['pending', 'submitted'] } },
      data: { status: 'paid', paid_at: now, reviewed_by: reviewerId, reviewed_at: now, review_note: note ? note.slice(0, 500) : null },
    });
    if (claimed.count !== 1) {
      return { ok: false as const, code: 409 as const, message: pay.status === 'paid' ? 'Pembayaran ini sudah disetujui.' : 'Pembayaran ini sudah ditolak dan tidak bisa disetujui. Minta pembeli membuat tagihan baru.' };
    }

    const meta = metaOf(pay);
    const ws = await tx.workspaces.findUnique({ where: { id: pay.workspace_id } });
    let rev: number | null = null;
    if (ws && isPlan(meta.plan) && meta.months) {
      // Perpanjangan paket yang sama dihitung dari akhir masa aktif; ganti paket dimulai sekarang (tanpa prorata).
      const current = effectivePlan(ws, now);
      const base = current === meta.plan && ws.plan_until && ws.plan_until > now ? ws.plan_until : now;
      const updated = await tx.workspaces.update({
        where: { id: ws.id },
        data: { plan: meta.plan, plan_until: addMonths(base, meta.months), rev: { increment: 1 } },
      });
      rev = Number(updated.rev);
    }
    return { ok: true as const, pay: (await tx.payments.findUnique({ where: { id } }))!, rev };
  });

  if (out.ok && out.rev !== null) broadcastSync(Number(out.pay.workspace_id), { rev: out.rev, senderId: 0, applied: 1 });
  return out.ok ? { ok: true, pay: out.pay } : out;
}

export async function rejectPayment(id: bigint, reviewerId: bigint, note: string): Promise<ApproveResult> {
  const now = new Date();
  const claimed = await prisma.payments.updateMany({
    where: { id, kind: 'plan', status: { in: ['pending', 'submitted'] } },
    data: { status: 'rejected', reviewed_by: reviewerId, reviewed_at: now, review_note: note.slice(0, 500) },
  });
  const pay = await prisma.payments.findUnique({ where: { id } });
  if (!pay || pay.kind !== 'plan') return { ok: false, code: 404, message: 'Pembayaran tidak ditemukan.' };
  if (claimed.count !== 1) return { ok: false, code: 409, message: pay.status === 'paid' ? 'Pembayaran ini sudah disetujui.' : 'Pembayaran ini sudah ditolak.' };
  return { ok: true, pay };
}
