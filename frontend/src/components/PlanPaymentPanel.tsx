import React, { useRef, useState } from 'react';
import { CheckCircle2, Clock, Copy, FileText, Hourglass, Upload, XCircle } from 'lucide-react';
import { api, saveBlob } from '../lib/api';
import type { PaymentInfo, PaymentStatus, PlanPayment } from '../lib/api';
import { errMsg, fmtDateLong, rupiah } from '../lib/format';
import { Pill } from './ui';

const LABEL: Record<string, string> = { pro: 'Pro', bisnis: 'Bisnis' };
export const STATUS_UI: Record<PaymentStatus, { text: string; bg: string; fg: string }> = {
  pending: { text: 'Menunggu pembayaran', bg: '#FDF3DC', fg: '#6B4A00' },
  submitted: { text: 'Menunggu verifikasi', bg: '#E4EEF9', fg: '#1D4F8C' },
  paid: { text: 'Lunas', bg: '#E3F3F0', fg: '#0B5F54' },
  rejected: { text: 'Ditolak', bg: '#FBE4E1', fg: '#B42318' },
  expired: { text: 'Kedaluwarsa', bg: '#ECEEF0', fg: '#4A5560' },
};

const fmtWhen = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const CopyBtn: React.FC<{ value: string; label: string; dark?: boolean }> = ({ value, label, dark }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Salin ${label}`}
      title={`Salin ${label}`}
      className={dark ? 'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white hover:bg-white/20' : 'btn-icon'}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500); }).catch(() => undefined);
      }}
    >
      {done ? <CheckCircle2 size={15} color={dark ? '#5EE0C9' : '#0B7A6B'} /> : <Copy size={15} />}
    </button>
  );
};

/**
 * Tagihan paket: nominal tepat (termasuk kode unik), tujuan pembayaran yang diatur superadmin,
 * unggah bukti transfer, dan status verifikasi. Paket aktif hanya setelah superadmin menyetujui.
 */
export const PlanPaymentPanel: React.FC<{ pay: PlanPayment; info: PaymentInfo; canPay: boolean; onChange: (p: PlanPayment | null) => void }> = ({ pay, info, canPay, onChange }) => {
  const [file, setFile] = useState<File | null>(null);
  const [sender, setSender] = useState('');
  const [method, setMethod] = useState<'qris' | 'bank'>(info.qrisImage ? 'qris' : 'bank');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const m = pay.meta;
  const ui = STATUS_UI[pay.status];

  const send = async () => {
    if (!file) return setErr('Pilih berkas bukti transfer (gambar atau PDF, maks 5 MB).');
    if (file.size > 5 * 1024 * 1024) return setErr('Ukuran bukti maksimal 5 MB.');
    setBusy('send');
    setErr('');
    try {
      onChange(await api.submitProof(pay.orderId, file, { method, senderName: sender.trim(), note: note.trim() }));
      setFile(null);
      if (input.current) input.current.value = '';
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  const view = async () => {
    try {
      saveBlob(await api.ownProof(pay.orderId), pay.proofName ?? 'bukti', true);
    } catch (e) {
      setErr(errMsg(e));
    }
  };

  const cancel = async () => {
    if (!window.confirm('Batalkan tagihan ini? Anda bisa membuat tagihan baru kapan saja.')) return;
    setBusy('cancel');
    try {
      await api.cancelPayment(pay.orderId);
      onChange(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  const planName = `Paket ${LABEL[m.plan] ?? m.plan} · ${m.period === 'yearly' ? 'tahunan' : 'bulanan'}`;
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="leading-tight"><div className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-arang-muted">Tagihan</div><strong className="text-[15px]">{planName}</strong></div>
      <Pill bg={ui.bg} fg={ui.fg} className="font-bold">{ui.text}</Pill>
    </div>
  );

  if (pay.status === 'paid') {
    return (
      <section aria-label="Pembayaran paket" className="flex flex-col items-center gap-3 rounded-2xl border border-[#CFEAE4] bg-gradient-to-b from-[#F3FAF8] to-white px-6 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lift" style={{ background: 'linear-gradient(135deg,#0F9D8A,#0B5F54)' }}><CheckCircle2 size={28} /></span>
        <div className="text-[20px] font-extrabold">Pembayaran diverifikasi. Paket {LABEL[m.plan]} aktif.</div>
        <p className="m-0 max-w-[460px] text-[14px] text-arang-body">Terima kasih! Semua fitur paket {LABEL[m.plan]} sudah bisa dipakai. Aktifkan modul bisnis yang Anda perlukan lewat Toko modul.</p>
        <span className="text-xs text-arang-muted">No. pesanan {pay.orderId}{pay.paidAt ? ` · lunas ${fmtDateLong(pay.paidAt.slice(0, 10))}` : ''}</span>
      </section>
    );
  }

  if (pay.status === 'rejected' || pay.status === 'expired') {
    return (
      <section aria-label="Pembayaran paket" className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
        {header}
        <span className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: pay.status === 'rejected' ? '#FDECEA' : '#FDF3DC', color: pay.status === 'rejected' ? '#B42318' : '#8A5A00' }}>
          <XCircle size={16} className="mt-0.5 shrink-0" />
          {pay.status === 'rejected' ? `Pembayaran ditolak${pay.reviewNote ? `: ${pay.reviewNote}` : '.'}` : 'Batas waktu tagihan habis.'} Pilih paket lagi untuk membuat tagihan baru.
        </span>
      </section>
    );
  }

  const waiting = pay.status === 'submitted';
  return (
    <section aria-label="Pembayaran paket" className="flex flex-col gap-5">
      {/* ── Nominal yang harus ditransfer ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#0E171C] px-6 py-5 text-white" style={{ color: '#fff' }}>
        <div className="flex flex-col gap-1">
          <span className="text-[11.5px] font-bold uppercase tracking-[0.12em]" style={{ color: '#5EE0C9' }}>{planName}</span>
          <div className="flex items-center gap-2">
            <span className="text-[32px] font-extrabold leading-none tracking-tight" aria-label={`Total transfer ${rupiah(pay.amount)}`}>{rupiah(pay.amount)}</span>
            <CopyBtn value={String(pay.amount)} label="nominal" dark />
          </div>
          <span className="text-[12.5px]" style={{ color: '#9FB0B8' }}>
            {m.flat ? `Paket ${LABEL[m.plan] ?? m.plan}${m.memberLimit ? ` (sampai ${m.memberLimit} anggota)` : ''} × ${m.period === 'yearly' ? `${Math.round(pay.baseAmount / Math.max(1, m.pricePerMonth ?? 1))} bulan (berlaku 12 bulan)` : '1 bulan'}` : `${m.seats} anggota × ${rupiah(m.pricePerUserMonth ?? 0)} × ${m.period === 'yearly' ? `${Math.round(pay.baseAmount / Math.max(1, (m.pricePerUserMonth ?? 1) * m.seats))} bulan (berlaku 12 bulan)` : '1 bulan'}`} = {rupiah(pay.baseAmount)}
            {pay.uniqueCode > 0 && <> + kode unik <b style={{ color: '#F2B33D' }}>{pay.uniqueCode}</b></>}
          </span>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Pill bg={ui.bg} fg={ui.fg} className="font-bold">{ui.text}</Pill>
          {pay.expiresAt && !waiting && <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: '#C9D1D6' }}><Clock size={13} />Bayar sebelum {fmtWhen(pay.expiresAt)}</span>}
        </div>
      </div>
      {pay.uniqueCode > 0 && !waiting && <span role="note" className="-mt-2 rounded-xl bg-kunyit-soft px-4 py-2.5 text-[13px] font-semibold" style={{ color: '#6B4A00' }}>Transfer tepat {rupiah(pay.amount)} (sudah termasuk kode unik) agar pembayaran mudah dicocokkan.</span>}

      {waiting ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#CFE0F3] bg-gradient-to-b from-[#F1F6FC] to-white px-6 py-9 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E4EEF9] text-[#1D4F8C]"><Hourglass size={22} /></span>
          <div className="text-[17px] font-bold">Bukti pembayaran terkirim{pay.submittedAt ? ` (${fmtWhen(pay.submittedAt)})` : ''}. Menunggu verifikasi administrator.</div>
          <p className="m-0 max-w-[460px] text-[13.5px] text-arang-body">Paket aktif otomatis setelah diverifikasi — halaman ini diperbarui sendiri, Anda boleh menutupnya.</p>
          {pay.hasProof && <button type="button" className="btn btn-outline btn-sm" onClick={view}><FileText size={14} /> Lihat bukti</button>}
          {err && <span role="alert" className="text-[13px] font-semibold text-danger">{err}</span>}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          {/* ── 1. Bayar ── */}
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5">
            <span className="flex items-center gap-2 text-[14px] font-bold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-[12px] text-brand">1</span>Bayar ke salah satu tujuan</span>
            <div className="flex flex-wrap gap-5">
              {info.qrisImage && (
                <figure className="m-0 flex flex-col items-center gap-2">
                  <img src={info.qrisImage} alt={`Kode QRIS pembayaran${info.qrisName ? ` ${info.qrisName}` : ''}`} width={190} height={190} className="h-[190px] w-[190px] rounded-xl border border-line bg-white object-contain p-1.5 shadow-xs" />
                  <figcaption className="text-xs font-semibold text-arang-muted">{info.qrisName ? `QRIS · ${info.qrisName}` : 'Pindai dengan e-wallet / mobile banking'}</figcaption>
                </figure>
              )}
              {info.accounts.length > 0 && (
                <div className="flex min-w-[200px] flex-1 flex-col gap-2">
                  <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-arang-muted">Transfer rekening</span>
                  {info.accounts.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-line-soft bg-canvas-subtle px-3.5 py-2.5 text-sm">
                      <div className="flex min-w-0 flex-col"><span className="font-bold">{a.bank} · {a.number}</span><span className="truncate text-xs text-arang-muted">a.n. {a.holder}</span></div>
                      <CopyBtn value={a.number.replace(/\D/g, '')} label={`nomor rekening ${a.bank}`} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            {info.instructions && <p className="m-0 whitespace-pre-line rounded-xl bg-canvas-subtle px-3.5 py-2.5 text-[12.5px] text-arang-body">{info.instructions}</p>}
          </div>

          {/* ── 2. Konfirmasi ── */}
          {canPay ? (
            <form className="flex flex-col gap-3.5 rounded-2xl border border-line bg-white p-5" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <span className="flex items-center gap-2 text-[14px] font-bold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-[12px] text-brand">2</span>Sudah transfer? Kirim bukti</span>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[12.5px] font-semibold">Nama pengirim
                  <input className="input" value={sender} maxLength={100} onChange={(e) => setSender(e.target.value)} placeholder="Nama di rekening/e-wallet" />
                </label>
                <div className="flex flex-col gap-1 text-[12.5px] font-semibold">
                  <span>Dibayar lewat</span>
                  <div role="radiogroup" aria-label="Dibayar lewat" className="flex h-10 gap-1 rounded-lg border border-line-strong p-1">
                    {info.qrisImage && <button type="button" role="radio" aria-checked={method === 'qris'} onClick={() => setMethod('qris')} className={`flex-1 cursor-pointer rounded-md border-0 text-[13px] font-semibold ${method === 'qris' ? 'bg-[#0E171C] text-white' : 'bg-transparent text-arang-body'}`}>QRIS</button>}
                    {info.accounts.length > 0 && <button type="button" role="radio" aria-checked={method === 'bank'} onClick={() => setMethod('bank')} className={`flex-1 cursor-pointer rounded-md border-0 text-[13px] font-semibold ${method === 'bank' ? 'bg-[#0E171C] text-white' : 'bg-transparent text-arang-body'}`}>Rekening</button>}
                  </div>
                </div>
              </div>
              <label className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${file ? 'border-brand-bright bg-brand-tint' : 'border-line-strong hover:border-brand-bright hover:bg-canvas-subtle'}`}>
                <input ref={input} type="file" className="sr-only" accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErr(''); }} />
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-brand shadow-xs">{file ? <FileText size={18} /> : <Upload size={18} />}</span>
                <span className="text-[13.5px] font-semibold">{file ? file.name : 'Pilih bukti transfer'}</span>
                <span className="text-[12px] text-arang-muted">{file ? `${(file.size / 1024).toFixed(0)} KB · klik untuk mengganti` : 'Tangkapan layar atau PDF · maks 5 MB'}</span>
              </label>
              <label className="flex flex-col gap-1 text-[12.5px] font-semibold">Catatan (opsional)
                <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="mis. transfer dari rekening kantor" />
              </label>
              {err && <span role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger">{err}</span>}
              <button type="submit" className="btn btn-primary h-11 w-full text-[14.5px]" disabled={!!busy}>{busy === 'send' ? 'Mengirim…' : 'Kirim bukti pembayaran'}</button>
              <button type="button" className="btn btn-ghost btn-sm self-center" disabled={!!busy} onClick={cancel}>Batalkan tagihan</button>
            </form>
          ) : (
            <div className="flex items-center justify-center rounded-2xl border border-line bg-white p-5 text-center text-[13px] text-arang-muted">Hanya pemilik workspace yang dapat mengunggah bukti pembayaran.</div>
          )}
        </div>
      )}
      <span className="text-[11.5px] text-arang-muted">No. pesanan {pay.orderId}</span>
    </section>
  );
};
