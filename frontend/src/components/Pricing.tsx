import React, { useCallback, useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Crown, Sparkles } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { href } from '../store/router';
import { api } from '../lib/api';
import type { BillingInfo, PlanPayment } from '../lib/api';
import { limitText, refreshPlanCatalog, usePlanCatalog, yearlySaving } from '../lib/plans';
import { errMsg, fmtDateLong, rupiah } from '../lib/format';
import { Modal, Pill } from './ui';
import { PlanPaymentPanel, STATUS_UI } from './PlanPaymentPanel';

type Buyable = 'pro' | 'bisnis';
type Period = 'monthly' | 'yearly';
const LABEL: Record<string, string> = { gratis: 'Gratis', pro: 'Pro', bisnis: 'Bisnis', enterprise: 'Enterprise' };
const fmtBytes = (n: number) => (n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1).replace('.', ',')} MB` : `${(n / 1024 ** 3).toFixed(2).replace('.', ',')} GB`);
const STEPS = ['Pilih paket', 'Bayar & unggah bukti', 'Verifikasi'];

/** Bilah pemakaian kecil: "3 / 5" dengan progres; tanpa batas tampil penuh tipis. */
const Meter: React.FC<{ label: string; used: number; max: number | null; fmt?: (n: number) => string }> = ({ label, used, max, fmt = String }) => {
  const pct = max === null ? 0 : Math.min(100, (used / Math.max(1, max)) * 100);
  const tone = max !== null && pct >= 90 ? '#B42318' : max !== null && pct >= 70 ? '#D98A0B' : '#0F9D8A';
  return (
    <div className="flex min-w-[150px] flex-1 flex-col gap-1.5">
      <div className="flex justify-between text-[12px]"><span className="text-arang-muted">{label}</span><span className="font-semibold">{fmt(used)} <span className="font-normal text-arang-muted">/ {max === null ? '∞' : fmt(max)}</span></span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line-soft"><div className="h-full rounded-full transition-all" style={{ width: max === null ? '100%' : `${pct}%`, background: max === null ? '#CFEAE4' : tone }} /></div>
    </div>
  );
};

/**
 * Dialog paket dalam tiga langkah: pilih paket → bayar & unggah bukti → verifikasi.
 * Semua angka (harga, anggota, batas, pemakaian) dari server; paket berubah hanya setelah administrator memverifikasi.
 */
export const Pricing: React.FC = () => {
  const { modal, setModal, mode, canManage, notify, refreshNow, account, me } = useApp();
  const isSuper = account?.is_superadmin === true || me.role === 'superadmin';
  const catalog = usePlanCatalog();
  const saving = yearlySaving(catalog);

  const open = modal === 'pricing';
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [period, setPeriod] = useState<Period>('monthly');
  const [selected, setSelected] = useState<Buyable>('pro');
  const [step, setStep] = useState<'choose' | 'pay'>('choose');
  const [pay, setPay] = useState<PlanPayment | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const b = await api.billing();
      setInfo(b);
      return b;
    } catch (e) {
      setErr(errMsg(e));
      return null;
    }
  }, []);

  // Saat dibuka: tagihan yang masih berjalan langsung ditampilkan; bila tidak ada, mulai dari pilih paket.
  // Semua keadaan awal dipasang bersamaan, sehingga klik pengguna tidak pernah tertimpa oleh data yang datang belakangan.
  useEffect(() => {
    if (!open) { setPay(null); setErr(''); setStep('choose'); setInfo(null); return; }
    if (mode !== 'server') return;
    let alive = true;
    void refreshPlanCatalog();
    api.billing().then((b) => {
      if (!alive) return;
      if (b.pending) {
        setPay(b.pending);
        setSelected((b.pending.meta.plan as Buyable) ?? 'pro');
        setPeriod((b.pending.meta.period as Period) ?? 'monthly');
        setStep('pay');
      } else {
        setSelected(b.plan === 'bisnis' ? 'bisnis' : 'pro');
      }
      setInfo(b);
    }).catch((e) => alive && setErr(errMsg(e)));
    return () => { alive = false; };
  }, [open, mode]);

  // Pantau tagihan sampai lunas, ditolak, atau kedaluwarsa.
  const waiting = pay?.status === 'pending' || pay?.status === 'submitted';
  useEffect(() => {
    if (!open || !pay || !waiting) return;
    const id = pay.orderId;
    const was = pay.status;
    const t = window.setInterval(async () => {
      try {
        const p = await api.planPayment(id);
        if (p.status === was) return;
        setPay(p);
        if (p.status === 'paid') {
          confetti({ particleCount: 110, spread: 75, origin: { y: 0.6 } });
          notify('Pembayaran diverifikasi', `Paket ${LABEL[p.meta.plan] ?? ''} aktif.`, 'success');
          refreshNow();
        } else if (p.status === 'rejected') {
          notify('Pembayaran ditolak', p.reviewNote ?? 'Periksa catatan pada tagihan.');
        }
        void load();
      } catch {
        // jaringan sesaat putus: coba lagi
      }
    }, 6000);
    return () => window.clearInterval(t);
  }, [open, pay, waiting, notify, refreshNow, load]);

  const total = (plan: Buyable, per: Period = period) => (info ? info.prices[plan] * info.periods[per].charged : 0);
  const limitOf = (plan: string) => catalog.plans.find((p) => p.key === plan)?.limits.members ?? null;
  /** Paket yang batas anggotanya lebih kecil dari jumlah anggota sekarang tidak bisa dibeli. */
  const tooSmall = (plan: Buyable) => { const m = limitOf(plan); return !!info && m !== null && info.seats > m; };

  /** Lanjut ke pembayaran: pakai tagihan yang sama bila cocok; bila beralih paket, tagihan lama yang belum dibayar dibatalkan. */
  const proceed = async () => {
    if (!info) return;
    setErr('');
    if (pay?.status === 'pending' && pay.meta.plan === selected && pay.meta.period === period) { setStep('pay'); return; }
    setBusy('checkout');
    try {
      if (pay?.status === 'pending') await api.cancelPayment(pay.orderId).catch(() => undefined);
      const p = await api.checkoutPlan(selected, period);
      setPay(p);
      setStep('pay');
      void load();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  const trial = async () => {
    setBusy('trial');
    setErr('');
    try {
      const r = await api.startTrial();
      notify('Uji coba Pro aktif', `Berlaku sampai ${fmtDateLong(r.planUntil.slice(0, 10))}.`, 'success');
      refreshNow();
      await load();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  const enterprise = () => {
    const contact = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;
    if (contact) window.location.href = `mailto:${contact}?subject=${encodeURIComponent('Permintaan paket Enterprise Rampung')}`;
    else notify('Kontak penjualan belum diatur', 'Isi VITE_CONTACT_EMAIL di frontend/.env agar tombol ini membuka email.');
  };

  const stepIndex = step === 'choose' ? 0 : pay?.status === 'paid' ? 3 : pay?.status === 'submitted' ? 2 : 1;
  const lockedByReview = pay?.status === 'submitted';
  const blockReason = !info ? '' : tooSmall(selected) ? `Anggota Anda (${info.seats}) melebihi batas paket ${LABEL[selected]} (${limitOf(selected)}). Pilih paket yang lebih besar atau keluarkan anggota.` : !info.paymentsConfigured ? 'Tujuan pembayaran belum diatur administrator.' : !info.canPurchase ? 'Hanya pemilik workspace yang dapat membeli paket.' : lockedByReview ? 'Pembayaran sebelumnya sedang diverifikasi.' : '';

  return (
    <Modal open={open} onClose={() => setModal(null)} title="Kelola paket" size="xl">
      {mode !== 'server' ? (
        <p className="m-0 text-sm text-arang-body">Masuk dengan akun untuk melihat dan mengelola paket workspace.</p>
      ) : !info ? (
        err ? <span role="alert" className="text-sm font-semibold text-danger">{err}</span> : <span role="status" className="text-sm text-arang-muted">Memuat paket…</span>
      ) : (
        <div className="flex flex-col gap-6">
          {/* ── Paket saat ini & pemakaian ── */}
          <section aria-label="Paket saat ini" className="flex flex-wrap items-center gap-5 rounded-2xl border border-line bg-gradient-to-br from-white to-[#F3FAF8] p-5">
            <div className="flex min-w-[220px] items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: 'linear-gradient(135deg,#0F9D8A,#0B5F54)' }}><Crown size={20} /></span>
              <div className="leading-tight">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-arang-muted">Paket saat ini</div>
                <div className="text-[18px] font-extrabold">{LABEL[info.plan]}</div>
                <div className="text-xs text-arang-muted">{info.planUntil ? `Berlaku s.d. ${fmtDateLong(info.planUntil.slice(0, 10))} · tidak diperpanjang otomatis` : info.plan === 'gratis' ? 'Paket bawaan tanpa batas waktu' : 'Tanpa batas waktu'}</div>
              </div>
            </div>
            <div className="flex min-w-[280px] flex-[2] flex-wrap gap-5">
              <Meter label="Anggota" used={info.usage.members} max={info.limits.members} />
              <Meter label="Proyek aktif" used={info.usage.activeProjects} max={info.limits.activeProjects} />
              <Meter label="Penyimpanan" used={info.usage.storageBytes} max={info.limits.storageBytes} fmt={fmtBytes} />
            </div>
            {info.trialAvailable && canManage && (
              <button type="button" className="btn btn-kunyit" disabled={!!busy} onClick={trial}><Sparkles size={15} />{busy === 'trial' ? 'Memproses…' : `Coba Pro ${info.trialDays} hari`}</button>
            )}
          </section>
          {info.expired && <div role="note" className="rounded-xl bg-kunyit-soft px-4 py-3 text-sm" style={{ color: '#6B4A00' }}>Masa paket sebelumnya sudah habis; workspace kembali ke Gratis.</div>}

          {/* ── Langkah ── */}
          <ol aria-label="Langkah pembelian" className="m-0 flex list-none items-center gap-2 p-0">
            {STEPS.map((s, i) => {
              const done = i < stepIndex;
              const cur = i === stepIndex;
              return (
                <li key={s} className="flex flex-1 items-center gap-2" aria-current={cur ? 'step' : undefined}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition-colors" style={done ? { background: '#0F9D8A', color: '#fff' } : cur ? { background: '#0E171C', color: '#fff' } : { background: '#ECEEEA', color: '#8A949B' }}>{done ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
                  <span className={`hidden text-[13px] sm:inline ${cur ? 'font-bold text-arang' : done ? 'font-semibold text-brand' : 'text-arang-muted'}`}>{s}</span>
                  {i < STEPS.length - 1 && <span className="h-px flex-1" style={{ background: done ? '#0F9D8A' : '#E2E5E1' }} />}
                </li>
              );
            })}
          </ol>

          {!info.paymentsConfigured && (
            <div role="note" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-kunyit-soft p-3.5 text-sm" style={{ color: '#6B4A00' }}>
              <span className="min-w-[240px] flex-1">{isSuper ? 'Tujuan pembayaran (QRIS/rekening) belum Anda atur, jadi pengguna belum bisa membeli paket.' : 'Tujuan pembayaran (QRIS/rekening) belum diatur oleh administrator sistem, jadi paket berbayar belum bisa dibeli. Hubungi administrator.'}</span>
              {isSuper && <a href={href.admin('pengaturan')} onClick={() => setModal(null)} className="btn btn-primary btn-sm" style={{ color: '#fff' }}>Buka Panel Superadmin</a>}
            </div>
          )}

          {step === 'choose' ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
              {/* ── Pilihan paket ── */}
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[13px] text-arang-muted">Harga tetap per tim · workspace Anda saat ini berisi <b className="text-arang">{info.seats} anggota</b></span>
                  <div role="radiogroup" aria-label="Periode tagihan" className="inline-flex gap-1 rounded-xl border border-line bg-white p-1 text-[13px] shadow-xs">
                    {(['monthly', 'yearly'] as const).map((p) => (
                      <button key={p} type="button" role="radio" aria-checked={period === p} onClick={() => setPeriod(p)} className={`h-8 cursor-pointer rounded-lg border-0 px-3.5 font-semibold transition ${period === p ? 'bg-[#0E171C] text-white' : 'bg-transparent text-arang-body hover:bg-canvas'}`}>
                        {p === 'monthly' ? 'Bulanan' : 'Tahunan'}{p === 'yearly' && saving > 0 && <span className="ml-1.5 rounded-md bg-kunyit px-1.5 py-[1px] text-[10.5px] font-bold" style={{ color: '#2A1D00' }}>−{saving} bln</span>}
                      </button>
                    ))}
                  </div>
                </div>

                <div role="radiogroup" aria-label="Pilih paket" className="grid gap-3 sm:grid-cols-3">
                  {catalog.plans.filter((p) => p.key !== 'enterprise').map((p) => {
                    const buyable = p.key === 'pro' || p.key === 'bisnis';
                    const isSel = buyable && selected === p.key;
                    const isCur = info.plan === p.key;
                    const price = p.key === 'gratis' ? 0 : info.prices[p.key as Buyable];
                    return (
                      <button
                        key={p.key}
                        type="button"
                        role="radio"
                        aria-label={`Paket ${p.name}`}
                        aria-checked={isSel}
                        aria-disabled={!buyable}
                        disabled={!buyable}
                        onClick={() => buyable && setSelected(p.key as Buyable)}
                        className={`relative flex flex-col gap-3 rounded-2xl border bg-white p-5 text-left transition-all ${buyable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lift' : 'cursor-default opacity-80'}`}
                        style={isSel ? { borderColor: '#0F9D8A', boxShadow: '0 0 0 3px rgba(15,157,138,.18), 0 12px 30px -12px rgba(11,95,84,.35)', background: 'linear-gradient(180deg,#F3FAF8,#fff 55%)' } : { borderColor: '#E2E5E1' }}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-[16px] font-bold text-arang">{p.name}{p.popular && <span className="rounded-full bg-kunyit-soft px-2 py-0.5 text-[10.5px] font-bold" style={{ color: '#6B4A00' }}>Populer</span>}</span>
                          {buyable && (
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors" style={isSel ? { borderColor: '#0F9D8A', background: '#0F9D8A' } : { borderColor: '#C9CEC8' }}>{isSel && <Check size={11} color="#fff" strokeWidth={3.5} />}</span>
                          )}
                        </span>
                        {isCur && <span className="absolute -top-2.5 left-5 rounded-full bg-[#0E171C] px-2.5 py-0.5 text-[10.5px] font-bold text-white">Paket Anda</span>}
                        <span className="flex flex-col">
                          <span className="text-[26px] font-extrabold leading-tight tracking-tight text-arang">{rupiah(price)}</span>
                          <span className="text-[12px] text-arang-muted">{p.key === 'gratis' ? `maks. ${limitText(p.limits.members)} anggota` : `per bulan · sampai ${limitText(p.limits.members)} anggota`}</span>
                        </span>
                        <span className="text-[12.5px] text-arang-body">{p.desc}</span>
                        <ul className="m-0 flex list-none flex-col gap-1.5 border-t border-line-soft p-0 pt-3 text-[13px] text-arang">
                          {p.items.map((i) => <li key={i} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-brand" />{i}</li>)}
                        </ul>
                        {buyable && tooSmall(p.key as Buyable) && <span className="mt-auto rounded-lg bg-danger-soft px-2.5 py-1.5 text-[12px] font-semibold text-danger">Anggota Anda ({info.seats}) melebihi batas paket ini</span>}
                        {!buyable && <span className="mt-auto text-[12px] text-arang-muted">{isCur ? 'Paket Anda sekarang' : 'Otomatis bila masa paket habis'}</span>}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line-strong px-5 py-4">
                  <div className="leading-tight"><div className="text-[14px] font-bold">Enterprise</div><div className="text-[12.5px] text-arang-muted">{catalog.plans.find((p) => p.key === 'enterprise')?.desc} Harga dan kontrak dibicarakan langsung.</div></div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={enterprise}>Hubungi kami</button>
                </div>
              </div>

              {/* ── Ringkasan pesanan ── */}
              <aside aria-label="Ringkasan pesanan" className="flex h-fit flex-col gap-4 rounded-2xl bg-[#0E171C] p-6 text-white shadow-pop lg:sticky lg:top-0" style={{ color: '#fff' }}>
                <span className="text-[11.5px] font-bold uppercase tracking-[0.12em]" style={{ color: '#5EE0C9' }}>Ringkasan pesanan</span>
                <div className="leading-tight">
                  <div className="text-[20px] font-extrabold">Paket {LABEL[selected]}</div>
                  <div className="text-[13px]" style={{ color: '#9FB0B8' }}>{period === 'yearly' ? 'Tahunan · berlaku 12 bulan' : 'Bulanan · berlaku 1 bulan'}</div>
                </div>
                <div className="flex flex-col gap-2 border-y border-white/10 py-4 text-[13px]" style={{ color: '#C9D1D6' }}>
                  <div className="flex justify-between"><span>Harga paket</span><span>{rupiah(info.prices[selected])} / bulan</span></div>
                  <div className="flex justify-between"><span>Batas anggota</span><span>sampai {limitText(limitOf(selected))}</span></div>
                  <div className="flex justify-between"><span>Durasi ditagih</span><span>× {info.periods[period].charged} bulan</span></div>
                  {period === 'yearly' && saving > 0 && <div className="flex justify-between" style={{ color: '#F2B33D' }}><span>Hemat</span><span>−{rupiah(info.prices[selected] * saving)}</span></div>}
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-[13px]" style={{ color: '#9FB0B8' }}>Total</span>
                  <span className="text-[28px] font-extrabold leading-none tracking-tight">{rupiah(total(selected))}</span>
                </div>
                <span className="text-[11.5px] leading-relaxed" style={{ color: '#7F9099' }}>Kode unik Rp1–999 ditambahkan saat tagihan dibuat agar transfer mudah dicocokkan.{info.plan === selected ? ' Masa aktif ditambahkan ke akhir paket Anda sekarang.' : ''}</span>
                <button type="button" onClick={proceed} disabled={!!busy || !!blockReason}
                  className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-[#F2B33D] text-[14.5px] font-bold transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50" style={{ color: '#2A1D00' }}>
                  {busy === 'checkout' ? 'Membuat tagihan…' : info.plan === selected ? `Perpanjang ${LABEL[selected]}` : 'Lanjut ke pembayaran'}<ArrowRight size={16} />
                </button>
                {blockReason && <span className="text-[12px]" style={{ color: '#F2B33D' }}>{blockReason}</span>}
                {pay?.status === 'pending' && !(pay.meta.plan === selected && pay.meta.period === period) && <span className="text-[11.5px]" style={{ color: '#9FB0B8' }}>Tagihan {LABEL[pay.meta.plan]} yang belum dibayar akan dibatalkan dan diganti.</span>}
              </aside>
            </div>
          ) : pay && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {(pay.status === 'pending' || pay.status === 'rejected' || pay.status === 'expired') ? (
                  <button type="button" className="btn btn-ghost btn-sm -ml-2" onClick={() => { setStep('choose'); if (pay.status !== 'pending') setPay(null); }}><ArrowLeft size={15} />Ganti paket</button>
                ) : <span />}
                {pay.status === 'paid' && <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal(null)}><CheckCircle2 size={15} />Selesai</button>}
              </div>
              <PlanPaymentPanel key={pay.orderId} pay={pay} info={info.paymentInfo} canPay={info.canPurchase} onChange={(p) => { setPay(p); if (!p) setStep('choose'); void load(); }} />
            </div>
          )}

          {err && <span role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{err}</span>}

          {info.history.length > 0 && (
            <details className="group rounded-2xl border border-line bg-white px-5 py-4 text-sm">
              <summary className="cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden">Riwayat tagihan <span className="font-normal text-arang-muted">({info.history.length})</span></summary>
              <ul className="m-0 mt-3 flex list-none flex-col p-0">
                {info.history.map((h) => (
                  <li key={h.orderId} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-2.5 text-[13px]">
                    <span>{h.createdAt ? fmtDateLong(h.createdAt.slice(0, 10)) : '-'} · <b>{LABEL[h.meta.plan] ?? h.meta.plan}</b> {h.meta.period === 'yearly' ? 'tahunan' : 'bulanan'} · {rupiah(h.amount)}</span>
                    <Pill bg={STATUS_UI[h.status].bg} fg={STATUS_UI[h.status].fg} className="font-bold">{STATUS_UI[h.status].text}</Pill>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <span className="text-xs leading-relaxed text-arang-muted">Bayar lewat QRIS atau transfer rekening, unggah bukti, lalu administrator memverifikasi; paket aktif setelah diverifikasi. Ganti paket berlaku sejak verifikasi tanpa prorata; perpanjangan paket yang sama ditambahkan ke akhir masa aktif. Harga belum termasuk pajak; tagihan berlaku {info.paymentTtlHours} jam.</span>
        </div>
      )}
    </Modal>
  );
};
