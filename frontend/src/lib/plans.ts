import { useEffect, useState } from 'react';
import { api } from './api';
import type { PlanCatalog } from './api';
import { PLANS } from './meta';

/**
 * Katalog paket dari server (harga, batas, deskripsi, fitur) — diatur Superadmin.
 * Sebelum termuat (atau bila server tak terjangkau) dipakai nilai bawaan agar halaman tetap tampil.
 */
const FALLBACK: PlanCatalog = {
  yearlyChargedMonths: 10,
  trialDays: 14,
  plans: PLANS.map((p) => ({
    key: p.key,
    name: p.name,
    monthly: p.monthly,
    desc: p.desc,
    items: p.items,
    popular: !!p.popular,
    limits: p.key === 'gratis' ? { members: 5, activeProjects: 3, storageGb: 1 } : { members: null, activeProjects: null, storageGb: null },
  })),
};

let cache: PlanCatalog = FALLBACK;
let loaded = false;
let inflight: Promise<PlanCatalog> | null = null;
const listeners = new Set<(c: PlanCatalog) => void>();

export const getPlanCatalog = () => cache;

/** Muat ulang dari server (mis. setelah Superadmin menyimpan perubahan). */
export function refreshPlanCatalog(): Promise<PlanCatalog> {
  inflight = api.plans().then((c) => {
    cache = c;
    loaded = true;
    listeners.forEach((l) => l(c));
    return c;
  }).catch(() => cache).finally(() => { inflight = null; });
  return inflight;
}

export function usePlanCatalog(): PlanCatalog {
  const [c, setC] = useState<PlanCatalog>(cache);
  useEffect(() => {
    listeners.add(setC);
    if (!loaded && !inflight) void refreshPlanCatalog();
    return () => { listeners.delete(setC); };
  }, []);
  return c;
}

export const planOf = (c: PlanCatalog, key: string) => c.plans.find((p) => p.key === key);
/** "5", "tanpa batas" */
export const limitText = (n: number | null, unit = '') => (n === null ? 'tanpa batas' : `${n.toLocaleString('id-ID')}${unit}`);
export const gbText = (gb: number | null) => (gb === null ? 'tanpa batas' : `${String(gb).replace('.', ',')} GB`);
/** Jumlah bulan yang "dihemat" pada tagihan tahunan. */
export const yearlySaving = (c: PlanCatalog) => Math.max(0, 12 - c.yearlyChargedMonths);
