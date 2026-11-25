import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Infinity as InfinityIcon, RotateCcw, Save } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { href } from '../store/router';
import { api } from '../lib/api';
import type { PlanConfig, PlanLimits } from '../lib/api';
import { errMsg, rupiah } from '../lib/format';
import { refreshPlanCatalog } from '../lib/plans';

type LimitKey = keyof PlanLimits;
const PLAN_NAME = { gratis: 'Gratis', pro: 'Pro', bisnis: 'Bisnis', enterprise: 'Enterprise' } as const;
const COLOR = { gratis: '#A9B4BB', pro: '#0F9D8A', bisnis: '#1D5FA8', enterprise: '#F2B33D' } as const;
const LIMIT_COLS: { key: LimitKey; label: string; unit: string; step: number; min: number }[] = [
  { key: 'members', label: 'Anggota', unit: 'orang', step: 1, min: 1 },
  { key: 'activeProjects', label: 'Proyek aktif', unit: 'proyek', step: 1, min: 1 },
  { key: 'storageGb', label: 'Penyimpanan', unit: 'GB', step: 0.5, min: 0.1 },
];

const Card: React.FC<{ title: string; desc?: string; children: React.ReactNode }> = ({ title, desc, children }) => (
  <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
    <div className="border-b border-line-soft px-6 py-4"><h2 className="m-0 text-[15px] font-bold">{title}</h2>{desc && <p className="m-0 mt-1 text-[13px] text-arang-muted">{desc}</p>}</div>
    <div className="p-6">{children}</div>
  </section>
);

const NumField: React.FC<{ id: string; label: string; hint?: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; prefix?: string; suffix?: string }> = ({ id, label, hint, value, onChange, min, max, step = 1, prefix, suffix }) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-[13px] font-semibold">{label}</label>
    <div className="flex items-center overflow-hidden rounded-lg border border-line-strong bg-white focus-within:border-brand-bright focus-within:shadow-[0_0_0_3px_rgba(15,157,138,.16)]">
      {prefix && <span className="border-r border-line bg-canvas-subtle px-3 py-2 text-[13px] text-arang-muted">{prefix}</span>}
      <input id={id} type="number" inputMode="numeric" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} className="h-10 min-w-0 flex-1 border-0 bg-transparent px-3 text-[14px] outline-none" />
      {suffix && <span className="border-l border-line bg-canvas-subtle px-3 py-2 text-[13px] text-arang-muted">{suffix}</span>}
    </div>
    {hint && <span className="text-xs text-arang-muted">{hint}</span>}
  </div>
);

/** Editor paket & batas untuk Superadmin. Semua nilai ditegakkan server begitu disimpan. */
export const PlansEditor: React.FC = () => {
  const { notify } = useApp();
  const [saved, setSaved] = useState<PlanConfig | null>(null);
  const [defaults, setDefaults] = useState<PlanConfig | null>(null);
  const [draft, setDraft] = useState<PlanConfig | null>(null);
  const [itemsText, setItemsText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const adopt = (c: PlanConfig) => {
    setSaved(c);
    setDraft(structuredClone(c));
    setItemsText(Object.fromEntries(Object.entries(c.catalog).map(([k, v]) => [k, v.items.join('\n')])));
  };
  useEffect(() => {
    api.adminPlans().then((r) => { setDefaults(r.defaults); adopt(r.config); }).catch((e) => setErr(errMsg(e)));
  }, []);

  // Draf lengkap = nilai formulir + daftar fitur dari kotak teks (satu fitur per baris).
  const full = useMemo<PlanConfig | null>(() => {
    if (!draft) return null;
    const catalog = { ...draft.catalog };
    for (const k of Object.keys(catalog) as (keyof PlanConfig['catalog'])[]) {
      catalog[k] = { ...catalog[k], items: (itemsText[k] ?? '').split('\n').map((x) => x.trim()).filter(Boolean) };
    }
    return { ...draft, catalog };
  }, [draft, itemsText]);
  const dirty = !!full && !!saved && JSON.stringify(full) !== JSON.stringify(saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (err && !draft) return <div role="alert" className="rounded-2xl border border-line bg-white p-6 text-sm font-semibold text-danger">{err}</div>;
  if (!draft || !full) return <div role="status" className="rounded-2xl border border-line bg-white p-6 text-sm text-arang-muted">Memuat konfigurasi paket…</div>;

  const set = <K extends keyof PlanConfig>(k: K, v: PlanConfig[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setLimit = (plan: 'gratis' | 'pro' | 'bisnis', key: LimitKey, v: number | null) =>
    setDraft((d) => (d ? { ...d, limits: { ...d.limits, [plan]: { ...d.limits[plan], [key]: v } } } : d));
  const saving = Math.max(0, 12 - draft.yearlyChargedMonths);

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api.saveAdminPlans(full);
      adopt(r.config);
      await refreshPlanCatalog();
      notify('Paket diperbarui', 'Harga dan batas baru langsung berlaku di seluruh Rampung.', 'success');
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const resetDefaults = () => {
    if (!defaults || !window.confirm('Isi formulir dengan nilai bawaan Rampung? Perubahan baru tersimpan setelah Anda menekan Simpan.')) return;
    setDraft(structuredClone(defaults));
    setItemsText(Object.fromEntries(Object.entries(defaults.catalog).map(([k, v]) => [k, v.items.join('\n')])));
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#CFEAE4] bg-brand-tint px-5 py-4 text-[13.5px]">
        <span className="max-w-[760px] text-arang-body">Perubahan berlaku <b>segera</b> untuk tagihan baru, batas anggota/proyek/penyimpanan, uji coba, serta halaman harga. Tagihan yang sudah dibuat tetap memakai nominal lama; workspace yang sudah melebihi batas baru tidak dihapus datanya, hanya tidak bisa menambah lagi.</span>
        <a href={href.landing} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-semibold">Lihat halaman harga <ExternalLink size={13} /></a>
      </div>

      <Card title="Harga & tagihan" desc="Harga per pengguna per bulan dalam rupiah.">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          <NumField id="price-pro" label="Harga Pro" prefix="Rp" value={draft.prices.pro} min={1000} max={100000000} step={1000} onChange={(n) => set('prices', { ...draft.prices, pro: n })} hint={Number.isFinite(draft.prices.pro) ? `${rupiah(draft.prices.pro)} / pengguna / bulan` : undefined} />
          <NumField id="price-bisnis" label="Harga Bisnis" prefix="Rp" value={draft.prices.bisnis} min={1000} max={100000000} step={1000} onChange={(n) => set('prices', { ...draft.prices, bisnis: n })} hint={Number.isFinite(draft.prices.bisnis) ? `${rupiah(draft.prices.bisnis)} / pengguna / bulan` : undefined} />
          <NumField id="yearly" label="Tagihan tahunan dibayar" suffix="bulan" value={draft.yearlyChargedMonths} min={1} max={12} onChange={(n) => set('yearlyChargedMonths', n)} hint={saving > 0 ? `Pembeli hemat ${saving} bulan per tahun` : 'Tanpa potongan tahunan'} />
          <NumField id="trial" label="Uji coba Pro" suffix="hari" value={draft.trialDays} min={0} max={90} onChange={(n) => set('trialDays', n)} hint={draft.trialDays === 0 ? 'Uji coba dimatikan' : 'Sekali per workspace'} />
          <NumField id="pro-mods" label="Modul bisnis paket Pro" suffix="modul" value={draft.proBusinessModules} min={0} max={4} onChange={(n) => set('proBusinessModules', n)} hint="Dari CRM, Keuangan, Time Tracking, SDM" />
        </div>
      </Card>

      <Card title="Batas per paket" desc="Centang “Tanpa batas” untuk menghapus batas. Enterprise selalu tanpa batas.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13.5px]">
            <thead className="text-[12px] font-semibold text-arang-muted"><tr><th className="pb-3 pr-4">Paket</th>{LIMIT_COLS.map((c) => <th key={c.key} className="pb-3 pr-4">{c.label}</th>)}</tr></thead>
            <tbody>
              {(['gratis', 'pro', 'bisnis'] as const).map((p) => (
                <tr key={p} className="border-t border-line-soft">
                  <td className="py-3 pr-4"><span className="flex items-center gap-2 font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[p] }} />{PLAN_NAME[p]}</span></td>
                  {LIMIT_COLS.map((c) => {
                    const v = draft.limits[p][c.key];
                    const unlimited = v === null;
                    return (
                      <td key={c.key} className="py-3 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className={`flex items-center overflow-hidden rounded-lg border border-line-strong ${unlimited ? 'opacity-40' : ''}`}>
                            <label className="sr-only" htmlFor={`lim-${p}-${c.key}`}>{c.label} paket {PLAN_NAME[p]}</label>
                            <input id={`lim-${p}-${c.key}`} type="number" min={c.min} step={c.step} disabled={unlimited} value={unlimited ? '' : Number.isFinite(v) ? v! : ''} onChange={(e) => setLimit(p, c.key, e.target.value === '' ? NaN : Number(e.target.value))} className="h-9 w-[92px] border-0 bg-white px-2.5 text-[14px] outline-none" />
                            <span className="border-l border-line bg-canvas-subtle px-2.5 py-2 text-xs text-arang-muted">{c.unit}</span>
                          </div>
                          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-arang-body">
                            <input type="checkbox" checked={unlimited} onChange={(e) => setLimit(p, c.key, e.target.checked ? null : c.key === 'storageGb' ? 1 : 5)} style={{ accentColor: '#0B7A6B' }} />
                            <InfinityIcon size={13} />Tanpa batas
                          </label>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t border-line-soft text-arang-muted">
                <td className="py-3 pr-4"><span className="flex items-center gap-2 font-semibold text-arang"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.enterprise }} />Enterprise</span></td>
                <td className="py-3 pr-4" colSpan={3}>Tanpa batas · paket ditetapkan manual di menu Workspace &amp; paket</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Tampilan di halaman harga" desc="Deskripsi singkat dan daftar keunggulan tiap paket (satu baris = satu poin, maksimal 8).">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {(['gratis', 'pro', 'bisnis', 'enterprise'] as const).map((p) => (
            <div key={p} className="flex flex-col gap-3 rounded-xl border border-line p-4">
              <span className="flex items-center gap-2 text-[14px] font-bold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[p] }} />{PLAN_NAME[p]}</span>
              <label className="flex flex-col gap-1 text-[12.5px] font-semibold" htmlFor={`desc-${p}`}>Deskripsi
                <input id={`desc-${p}`} className="input" maxLength={160} value={draft.catalog[p].desc} onChange={(e) => set('catalog', { ...draft.catalog, [p]: { ...draft.catalog[p], desc: e.target.value } })} />
              </label>
              <label className="flex flex-col gap-1 text-[12.5px] font-semibold" htmlFor={`items-${p}`}>Keunggulan
                <textarea id={`items-${p}`} className="input min-h-[132px] text-[13px]" value={itemsText[p] ?? ''} onChange={(e) => setItemsText((t) => ({ ...t, [p]: e.target.value }))} />
              </label>
              <span className="text-[11.5px] text-arang-muted">{full.catalog[p].items.length}/8 poin</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Bilah simpan menempel di bawah */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur lg:left-[260px]">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <span className="text-[13px]" style={{ color: err ? '#B42318' : dirty ? '#8A5A00' : '#5B6670' }} role={err ? 'alert' : 'status'}>{err || (dirty ? 'Ada perubahan yang belum disimpan.' : 'Semua perubahan tersimpan.')}</span>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !defaults} onClick={resetDefaults}><RotateCcw size={14} />Isi nilai bawaan</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={busy || !dirty} onClick={() => saved && adopt(saved)}>Batalkan</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={save}><Save size={14} />{busy ? 'Menyimpan…' : 'Simpan perubahan'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};
