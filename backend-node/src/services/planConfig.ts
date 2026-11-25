import { prisma } from '../db';
import { LIMITS, MONTHS_CHARGED, PLAN_RUNTIME, PLAN_PRICE_MONTH } from './plans';
import type { Plan } from './plans';

/**
 * Konfigurasi paket yang dapat diubah Superadmin (disimpan di platform_settings, kunci "plans").
 * Nilai yang diterapkan langsung dipakai seluruh server: harga checkout, batas anggota/proyek/penyimpanan,
 * masa uji coba, dan jumlah modul bisnis paket Pro.
 */
export interface PlanLimitInput { members: number | null; activeProjects: number | null; storageGb: number | null }
export interface PlanCatalogEntry { desc: string; items: string[] }
export interface PlanConfig {
  prices: { pro: number; bisnis: number };
  yearlyChargedMonths: number;
  trialDays: number;
  proBusinessModules: number;
  limits: Record<'gratis' | 'pro' | 'bisnis', PlanLimitInput>;
  catalog: Record<Plan, PlanCatalogEntry>;
}

const KEY = 'plans';
const GB = 1024 ** 3;

export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  prices: { pro: 149_000, bisnis: 349_000 },
  yearlyChargedMonths: 10,
  trialDays: 14,
  proBusinessModules: 1,
  limits: {
    gratis: { members: 5, activeProjects: 3, storageGb: 1 },
    pro: { members: 10, activeProjects: null, storageGb: null },
    bisnis: { members: 30, activeProjects: null, storageGb: null },
  },
  catalog: {
    gratis: { desc: 'Untuk tim kecil yang baru mulai.', items: ['Board, List, dan Kalender', '3 proyek aktif', 'Komentar dan @mention', 'Penyimpanan 1 GB'] },
    pro: { desc: 'Untuk tim yang butuh perencanaan lengkap.', items: ['Proyek tanpa batas', 'Timeline/Gantt dan dependensi', 'Otomasi', '1 modul bisnis pilihan'] },
    bisnis: { desc: 'Untuk agensi dan perusahaan yang melayani klien.', items: ['Semua modul bisnis', 'Portal klien', 'Integrasi WhatsApp & otomasi', 'Invoice dan pelunasan klien'] },
    enterprise: { desc: 'Untuk organisasi dengan kebutuhan khusus.', items: ['Semua fitur Bisnis', 'Harga dan kontrak khusus', 'Bantuan instalasi di server sendiri', 'Pendampingan onboarding tim'] },
  },
};

let current: PlanConfig = structuredClone(DEFAULT_PLAN_CONFIG);
export const getPlanConfig = (): PlanConfig => current;

/** Salin konfigurasi ke tabel aturan yang dipakai seluruh server. */
function apply(cfg: PlanConfig) {
  current = cfg;
  PLAN_PRICE_MONTH.pro = cfg.prices.pro;
  PLAN_PRICE_MONTH.bisnis = cfg.prices.bisnis;
  MONTHS_CHARGED.yearly.charged = cfg.yearlyChargedMonths;
  PLAN_RUNTIME.trialDays = cfg.trialDays;
  PLAN_RUNTIME.proBusinessModules = cfg.proBusinessModules;
  for (const p of ['gratis', 'pro', 'bisnis'] as const) {
    const l = cfg.limits[p];
    LIMITS[p] = { members: l.members, activeProjects: l.activeProjects, storageBytes: l.storageGb === null ? null : Math.round(l.storageGb * GB) };
  }
  LIMITS.enterprise = { members: null, activeProjects: null, storageBytes: null };
}

/** Kembali ke bawaan (dipakai tes). */
export function resetPlanConfig() {
  apply(structuredClone(DEFAULT_PLAN_CONFIG));
}

/** Muat dari database saat server mulai; bila rusak/kosong, pakai bawaan. */
export async function loadPlanConfig(): Promise<PlanConfig> {
  const row = await prisma.platform_settings.findUnique({ where: { key: KEY } });
  let cfg = structuredClone(DEFAULT_PLAN_CONFIG);
  if (row) {
    try {
      const parsed = parsePlanConfig(JSON.parse(row.value));
      if (!('error' in parsed)) cfg = parsed.value;
    } catch {
      /* data rusak: tetap bawaan */
    }
  }
  apply(cfg);
  return cfg;
}

export async function savePlanConfig(cfg: PlanConfig, userId: bigint) {
  const value = JSON.stringify(cfg);
  await prisma.platform_settings.upsert({ where: { key: KEY }, create: { key: KEY, value, updated_by: userId }, update: { value, updated_by: userId } });
  apply(cfg);
}

const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const LABEL: Record<string, string> = { gratis: 'Gratis', pro: 'Pro', bisnis: 'Bisnis', enterprise: 'Enterprise' };

/** Validasi masukan Superadmin; pesan galat berbahasa Indonesia yang menyebut kolomnya. */
export function parsePlanConfig(body: unknown): { error: string } | { value: PlanConfig } {
  const b = (body ?? {}) as Record<string, unknown>;
  const prices = (b.prices ?? {}) as Record<string, unknown>;
  const pro = int(prices.pro, 1_000, 100_000_000);
  const bisnis = int(prices.bisnis, 1_000, 100_000_000);
  if (pro === undefined || bisnis === undefined) return { error: 'Harga paket Pro dan Bisnis (per bulan) harus bilangan bulat antara Rp1.000 dan Rp100.000.000.' };
  if (bisnis < pro) return { error: 'Harga Bisnis tidak boleh lebih murah dari Pro.' };

  const yearly = int(b.yearlyChargedMonths, 1, 12);
  if (yearly === undefined) return { error: 'Tagihan tahunan harus 1–12 bulan (mis. 10 = hemat 2 bulan).' };
  const trial = int(b.trialDays, 0, 90);
  if (trial === undefined) return { error: 'Masa uji coba harus 0–90 hari (0 = uji coba dimatikan).' };
  const mods = int(b.proBusinessModules, 0, 4);
  if (mods === undefined) return { error: 'Jumlah modul bisnis paket Pro harus 0–4.' };

  const limitsIn = (b.limits ?? {}) as Record<string, Record<string, unknown>>;
  const limits = {} as PlanConfig['limits'];
  for (const p of ['gratis', 'pro', 'bisnis'] as const) {
    const l = limitsIn[p] ?? {};
    const members = l.members === null ? null : int(l.members, 1, 100_000);
    const projects = l.activeProjects === null ? null : int(l.activeProjects, 1, 100_000);
    const storage = l.storageGb === null ? null : num(l.storageGb, 0.1, 100_000);
    if (members === undefined) return { error: `Batas anggota paket ${LABEL[p]} harus 1–100.000 atau tanpa batas.` };
    if (projects === undefined) return { error: `Batas proyek aktif paket ${LABEL[p]} harus 1–100.000 atau tanpa batas.` };
    if (storage === undefined) return { error: `Batas penyimpanan paket ${LABEL[p]} harus 0,1–100.000 GB atau tanpa batas.` };
    limits[p] = { members, activeProjects: projects, storageGb: storage === null ? null : Math.round(storage * 100) / 100 };
  }

  const proM = limits.pro.members;
  const bisM = limits.bisnis.members;
  if (proM === null ? bisM !== null : bisM !== null && bisM < proM) return { error: 'Batas anggota Bisnis tidak boleh lebih kecil dari Pro.' };

  const catIn = (b.catalog ?? {}) as Record<string, Record<string, unknown>>;
  const catalog = {} as PlanConfig['catalog'];
  for (const p of ['gratis', 'pro', 'bisnis', 'enterprise'] as const) {
    const c = catIn[p] ?? {};
    const items = Array.isArray(c.items) ? c.items.map((x) => text(x, 80)).filter(Boolean) : [];
    if (items.length > 8) return { error: `Daftar fitur paket ${LABEL[p]} maksimal 8 baris.` };
    const desc = text(c.desc, 160);
    if (!desc) return { error: `Deskripsi paket ${LABEL[p]} wajib diisi.` };
    catalog[p] = { desc, items };
  }

  return { value: { prices: { pro, bisnis }, yearlyChargedMonths: yearly, trialDays: trial, proBusinessModules: mods, limits, catalog } };
}

/** Katalog publik untuk halaman depan & dialog paket. */
export function publicCatalog() {
  const c = current;
  return {
    yearlyChargedMonths: c.yearlyChargedMonths,
    trialDays: c.trialDays,
    plans: (['gratis', 'pro', 'bisnis', 'enterprise'] as const).map((key) => ({
      key,
      name: LABEL[key],
      monthly: key === 'gratis' ? 0 : key === 'enterprise' ? null : c.prices[key],
      desc: c.catalog[key].desc,
      items: c.catalog[key].items,
      limits: key === 'enterprise' ? { members: null, activeProjects: null, storageGb: null } : c.limits[key],
      popular: key === 'pro',
    })),
  };
}
