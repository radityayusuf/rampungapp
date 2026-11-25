/**
 * Aturan paket Rampung — satu sumber kebenaran di server.
 * Harga dan batas mengikuti dokumen konsep: Gratis (maks. 5 anggota, 3 proyek aktif, 1 GB),
 * Paket bertingkat berharga tetap: Pro dan Bisnis ditagih per paket per bulan dengan batas anggota (bukan per pengguna); tahunan = 10 bulan ("hemat 2 bulan").
 */

export const PLANS = ['gratis', 'pro', 'bisnis', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];
export type PaidPlan = 'pro' | 'bisnis';
export type Period = 'monthly' | 'yearly';

/** Harga TETAP per paket per bulan (bukan per pengguna). Batas anggota paket ada di LIMITS. */
export const PLAN_PRICE_MONTH: Record<PaidPlan, number> = { pro: 149_000, bisnis: 349_000 };
export const MONTHS_CHARGED: Record<Period, { months: number; charged: number }> = {
  monthly: { months: 1, charged: 1 },
  yearly: { months: 12, charged: 10 },
};
/** Nilai yang dapat diubah Superadmin saat berjalan (lihat services/planConfig.ts). */
export const PLAN_RUNTIME = { trialDays: 14, proBusinessModules: 1 };

/** null = tanpa batas. */
export const LIMITS: Record<Plan, { members: number | null; activeProjects: number | null; storageBytes: number | null }> = {
  gratis: { members: 5, activeProjects: 3, storageBytes: 1024 ** 3 },
  pro: { members: null, activeProjects: null, storageBytes: null },
  bisnis: { members: null, activeProjects: null, storageBytes: null },
  enterprise: { members: null, activeProjects: null, storageBytes: null },
};

/** Modul bisnis (Pro: maksimal PLAN_RUNTIME.proBusinessModules, bawaan satu). integrations & aiAssistant khusus Bisnis ke atas. */
export const BUSINESS_MODULES = ['timeTracking', 'crm', 'finance', 'sdm'] as const;
export const BISNIS_MODULES = ['integrations', 'aiAssistant'] as const;

const rank = (p: Plan) => PLANS.indexOf(p);
export const atLeast = (p: Plan, min: Plan) => rank(p) >= rank(min);
export const isPlan = (v: unknown): v is Plan => typeof v === 'string' && (PLANS as readonly string[]).includes(v);

/** Paket yang berlaku sekarang: paket berbayar yang sudah lewat masanya kembali ke Gratis. */
export function effectivePlan(ws: { plan: string; plan_until: Date | null }, now = new Date()): Plan {
  const p: Plan = isPlan(ws.plan) ? ws.plan : 'gratis';
  if (p === 'gratis') return 'gratis';
  if (ws.plan_until && ws.plan_until.getTime() <= now.getTime()) return 'gratis';
  return p;
}

/** Selaraskan modul yang menyala dengan paket: yang tidak termasuk paket dimatikan. */
export function sanitizeModules(plan: Plan, raw: unknown): Record<string, boolean> {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Record<string, boolean> = {};
  for (const k of [...BUSINESS_MODULES, ...BISNIS_MODULES]) out[k] = src[k] === true;

  if (plan === 'gratis') {
    for (const k of Object.keys(out)) out[k] = false;
  } else if (plan === 'pro') {
    for (const k of BISNIS_MODULES) out[k] = false;
    let kept = 0;
    for (const k of BUSINESS_MODULES) {
      if (out[k] && kept < PLAN_RUNTIME.proBusinessModules) kept++;
      else out[k] = false;
    }
  }
  return out;
}

/** Tagihan paket: harga tetap × bulan ditagih. `seats` hanya dicatat sebagai informasi (jumlah anggota saat membeli). */
export function quote(plan: PaidPlan, period: Period, seats: number) {
  const { months, charged } = MONTHS_CHARGED[period];
  return { amount: PLAN_PRICE_MONTH[plan] * charged, months, seats: Math.max(1, Math.floor(seats)), pricePerMonth: PLAN_PRICE_MONTH[plan], memberLimit: LIMITS[plan].members };
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getTime());
  const day = r.getDate();
  r.setMonth(r.getMonth() + months);
  if (r.getDate() < day) r.setDate(0); // 31 Jan + 1 bulan = 28/29 Feb, bukan 3 Mar
  return r;
}

/** Proyek "aktif" = belum selesai. */
export const isActiveProject = (p: unknown) => !!p && typeof p === 'object' && (p as { status?: unknown }).status !== 'completed';

export const PLAN_LABEL: Record<Plan, string> = { gratis: 'Gratis', pro: 'Pro', bisnis: 'Bisnis', enterprise: 'Enterprise' };

/** 1073741824 → "1 GB", 536870912 → "0,5 GB". */
export const formatGb = (bytes: number) => `${String(Math.round((bytes / 1024 ** 3) * 100) / 100).replace('.', ',')} GB`;
