import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock, Download, FileSpreadsheet, FileText, Inbox, Plus, RefreshCw, Search, ShieldAlert, Trash2, Upload, Wallet, X, XCircle } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { api, saveBlob } from '../lib/api';
import type { AdminPayment, AdminPaymentList, PaymentFilter, PaymentSettings } from '../lib/api';
import { errMsg, rupiah } from '../lib/format';
import { Modal, Pill } from './ui';
import { STATUS_UI } from './PlanPaymentPanel';

const PLAN: Record<string, string> = { pro: 'Pro', bisnis: 'Bisnis', enterprise: 'Enterprise', gratis: 'Gratis' };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');

type Row = { bank: string; number: string; holder: string };

/** Tujuan pembayaran yang dilihat pembeli: gambar QRIS dan rekening bank. */
export const PaymentSettingsCard: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const { notify } = useApp();
  const [s, setS] = useState<PaymentSettings | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [qrisName, setQrisName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [uniqueCode, setUniqueCode] = useState(true);
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (v: PaymentSettings) => {
    setS(v);
    setRows(v.accounts.map(({ bank, number, holder }) => ({ bank, number, holder })));
    setQrisName(v.qrisName);
    setInstructions(v.instructions);
    setUniqueCode(v.uniqueCode);
  };
  useEffect(() => {
    api.paymentSettings().then(apply).catch((e) => notify('Gagal memuat pengaturan pembayaran', errMsg(e)));
  }, [notify]);

  const patchRow = (i: number, k: keyof Row, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const save = async () => {
    setBusy('save');
    try {
      apply(await api.savePaymentSettings({ accounts: rows, qrisName, instructions, uniqueCode }));
      notify('Pengaturan pembayaran disimpan', 'Pembeli akan melihat tujuan pembayaran yang baru.', 'success');
      onSaved();
    } catch (e) {
      notify('Gagal menyimpan', errMsg(e));
    } finally {
      setBusy('');
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy('qris');
    try {
      apply(await api.uploadQris(file));
      notify('Gambar QRIS diperbarui', undefined, 'success');
      onSaved();
    } catch (e) {
      notify('Gagal mengunggah QRIS', errMsg(e));
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeQris = async () => {
    if (!window.confirm('Hapus gambar QRIS? Pembeli tidak akan melihat QRIS lagi.')) return;
    setBusy('qris');
    try {
      apply(await api.deleteQris());
      onSaved();
    } catch (e) {
      notify('Gagal menghapus QRIS', errMsg(e));
    } finally {
      setBusy('');
    }
  };

  if (!s) return <div className="rounded-2xl border border-line bg-white p-6 text-sm text-arang-muted shadow-sm" role="status">Memuat pengaturan pembayaran…</div>;

  return (
    <section aria-label="Pengaturan tujuan pembayaran" className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="m-0 text-base font-bold text-arang">Tujuan pembayaran paket</h3>
          <p className="m-0 mt-1 text-xs text-arang-muted">Yang Anda isi di sini ditampilkan kepada pembeli saat membeli paket Pro/Bisnis.</p>
        </div>
        {s.configured ? <Pill bg="#E3F3F0" fg="#0B5F54" className="font-bold">Siap menerima pembayaran</Pill> : <Pill bg="#FDF3DC" fg="#6B4A00" className="font-bold">Belum diatur — paket belum bisa dibeli</Pill>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="flex flex-col items-start gap-2">
          <span className="text-xs font-bold text-arang-muted">GAMBAR QRIS</span>
          {s.qrisImage ? (
            <img src={s.qrisImage} alt="Pratinjau QRIS" className="h-[200px] w-[200px] rounded-lg border border-line bg-white object-contain p-1" />
          ) : (
            <div className="flex h-[200px] w-[200px] items-center justify-center rounded-lg border border-dashed border-line-strong text-center text-xs text-arang-muted">Belum ada QRIS</div>
          )}
          <input ref={fileRef} id="qris-file" type="file" className="sr-only" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(e) => void upload(e.target.files?.[0])} />
          <div className="flex gap-2">
            <label htmlFor="qris-file" className={`btn btn-outline btn-sm cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}><Upload size={14} /> {s.qrisImage ? 'Ganti' : 'Unggah'} QRIS</label>
            {s.qrisImage && <button type="button" className="btn btn-outline btn-sm" disabled={!!busy} onClick={removeQris}><Trash2 size={14} /> Hapus</button>}
          </div>
          <span className="text-[11px] text-arang-muted">PNG/JPG/WebP, maks 1 MB. Pakai QRIS statis milik Anda.</span>
          <label className="mt-1 flex w-full flex-col gap-1 text-xs font-semibold" htmlFor="qris-name">Nama merchant di QRIS
            <input id="qris-name" className="input" value={qrisName} maxLength={100} onChange={(e) => setQrisName(e.target.value)} placeholder="mis. Rampung Digital" />
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold text-arang-muted">REKENING BANK / E-WALLET ({rows.length}/10)</span>
          {rows.length === 0 && <span className="text-sm text-arang-muted">Belum ada rekening.</span>}
          {rows.map((r, i) => (
            <div key={i} className="grid items-end gap-2" style={{ gridTemplateColumns: 'minmax(90px,1fr) minmax(130px,1.4fr) minmax(130px,1.4fr) auto' }}>
              <label className="flex flex-col gap-1 text-xs font-semibold">Bank<input className="input" aria-label={`Bank rekening ${i + 1}`} value={r.bank} maxLength={60} onChange={(e) => patchRow(i, 'bank', e.target.value)} placeholder="BCA" /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">Nomor<input className="input" aria-label={`Nomor rekening ${i + 1}`} inputMode="numeric" value={r.number} maxLength={40} onChange={(e) => patchRow(i, 'number', e.target.value)} placeholder="1234567890" /></label>
              <label className="flex flex-col gap-1 text-xs font-semibold">Atas nama<input className="input" aria-label={`Atas nama rekening ${i + 1}`} value={r.holder} maxLength={100} onChange={(e) => patchRow(i, 'holder', e.target.value)} placeholder="PT Rampung" /></label>
              <button type="button" className="btn-icon" aria-label={`Hapus rekening ${i + 1}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
          {rows.length < 10 && <button type="button" className="btn btn-outline btn-sm self-start" onClick={() => setRows((x) => [...x, { bank: '', number: '', holder: '' }])}><Plus size={14} /> Tambah rekening</button>}

          <label className="flex flex-col gap-1 text-xs font-semibold" htmlFor="pay-instr">Petunjuk untuk pembeli (opsional)
            <textarea id="pay-instr" className="input" rows={3} maxLength={600} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="mis. Konfirmasi ke WhatsApp 0812… bila belum aktif dalam 1 hari kerja." />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={uniqueCode} onChange={(e) => setUniqueCode(e.target.checked)} />
            <span><strong>Tambahkan kode unik (Rp1–999) pada setiap tagihan</strong><br /><span className="text-xs text-arang-muted">Memudahkan mencocokkan transfer di mutasi rekening. Pembeli diminta transfer nominal tepat.</span></span>
          </label>
          <div><button type="button" className="btn btn-primary" disabled={!!busy} onClick={save}>{busy === 'save' ? 'Menyimpan…' : 'Simpan pengaturan'}</button></div>
        </div>
      </div>
    </section>
  );
};

const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export const AdminPaymentsPanel: React.FC<{ onAwaiting: (n: number) => void; withSettings?: boolean }> = ({ onAwaiting, withSettings = true }) => {
  const { notify } = useApp();
  const [draft, setDraft] = useState<PaymentFilter>({ status: '', q: '', from: '', to: '', basis: 'created' });
  const [filter, setFilter] = useState<PaymentFilter>({ status: '', q: '', from: '', to: '', basis: 'created' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminPaymentList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<AdminPayment | null>(null);
  const [reason, setReason] = useState('');
  const [exporting, setExporting] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.adminPayments({ ...filter, page, pageSize: 20 });
      setData(r);
      onAwaiting(r.awaitingReviewAll);
    } catch (e) {
      notify('Gagal memuat pembayaran', errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [filter, page, notify, onAwaiting]);
  useEffect(() => { void load(); }, [load]);
  // Pembayaran baru masuk kapan saja: segarkan daftar berkala selagi panel terbuka.
  useEffect(() => {
    const t = window.setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const apply = (e: React.FormEvent) => { e.preventDefault(); setPage(1); setFilter({ ...draft }); };
  const reset = () => { const f: PaymentFilter = { status: '', q: '', from: '', to: '', basis: 'created' }; setDraft(f); setFilter(f); setPage(1); };

  const approve = async (p: AdminPayment) => {
    const msg = `Setujui pembayaran ${rupiah(p.amount)} dari ${p.workspaceName}?\n\nPaket ${PLAN[p.plan] ?? p.plan} (${p.period === 'yearly' ? '12' : '1'} bulan) akan langsung aktif. Pastikan dana sudah masuk ke rekening/QRIS Anda.`;
    if (!window.confirm(msg)) return;
    setBusyId(p.id);
    try {
      await api.approvePayment(p.id);
      notify('Pembayaran disetujui', `${p.workspaceName}: paket ${PLAN[p.plan] ?? p.plan} aktif.`, 'success');
      await load();
    } catch (e) {
      notify('Gagal menyetujui', errMsg(e));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await api.rejectPayment(rejecting.id, reason.trim());
      notify('Pembayaran ditolak', 'Pembeli akan melihat alasannya.', 'success');
      setRejecting(null);
      setReason('');
      await load();
    } catch (e) {
      notify('Gagal menolak', errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const viewProof = async (p: AdminPayment) => {
    try {
      saveBlob(await api.adminProof(p.id), p.proofName ?? 'bukti', true);
    } catch (e) {
      notify('Gagal membuka bukti', errMsg(e));
    }
  };

  const exportAs = async (format: 'csv' | 'xlsx') => {
    setExporting(format);
    try {
      saveBlob(await api.exportPayments(filter, format), `laporan-pembayaran-${today()}.${format}`);
    } catch (e) {
      notify('Gagal mengekspor laporan', errMsg(e));
    } finally {
      setExporting('');
    }
  };

  const sum = data?.summary;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const tabs: [string, string, number | undefined][] = [
    ['', 'Semua', sum?.total],
    ['submitted', 'Menunggu verifikasi', sum?.awaitingReview],
    ['pending', 'Menunggu pembayaran', sum?.pending],
    ['paid', 'Lunas', sum?.paidCount],
    ['rejected', 'Ditolak', sum?.rejected],
    ['expired', 'Kedaluwarsa', sum?.expired],
  ];
  const pickTab = (status: string) => { setDraft((d) => ({ ...d, status })); setFilter((f) => ({ ...f, status })); setPage(1); };

  return (
    <div className="flex flex-col gap-6">
      {withSettings && <PaymentSettingsCard onSaved={() => void load()} />}

      <section aria-label="Ringkasan pembayaran" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {([
          ['Pendapatan (lunas)', sum ? rupiah(sum.paidAmount) : '–', `${sum?.paidCount ?? 0} transaksi terverifikasi`, <Wallet key="w" size={17} />, '#0B7A6B'],
          ['Menunggu verifikasi', String(sum?.awaitingReview ?? '–'), sum?.awaitingReview ? 'Perlu tindakan Anda' : 'Tidak ada antrean', <ShieldAlert key="s" size={17} />, '#D98A0B'],
          ['Menunggu pembayaran', String(sum?.pending ?? '–'), 'Tagihan dibuat, belum ada bukti', <Clock key="c" size={17} />, '#1D5FA8'],
          ['Ditolak / kedaluwarsa', sum ? `${sum.rejected} / ${sum.expired}` : '–', 'Sesuai filter aktif', <XCircle key="x" size={17} />, '#8A949B'],
        ] as const).map(([t, v, d, icon, tone]) => (
          <div key={t} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5 shadow-card">
            <div className="flex items-center justify-between"><span className="text-[13px] font-medium text-arang-muted">{t}</span><span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${tone}1A`, color: tone }}>{icon}</span></div>
            <span className="text-[26px] font-extrabold leading-none tracking-tight">{v}</span>
            <span className="text-xs text-arang-muted">{d}</span>
          </div>
        ))}
      </section>

      <section aria-label="Daftar pembayaran" className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div role="tablist" aria-label="Status pembayaran" className="flex gap-1 overflow-x-auto border-b border-line px-3">
          {tabs.map(([k, l, n]) => {
            const on = (filter.status ?? '') === k;
            return (
              <button key={k || 'all'} type="button" role="tab" aria-selected={on} onClick={() => pickTab(k)}
                className="-mb-px flex h-12 shrink-0 cursor-pointer items-center gap-2 border-0 border-b-2 bg-transparent px-3 text-[13.5px] font-semibold transition-colors"
                style={on ? { borderBottomColor: '#0F9D8A', color: '#0B5F54' } : { borderBottomColor: 'transparent', color: '#5B6670' }}>
                {l}{n !== undefined && <span className="rounded-full px-1.5 text-[11px] font-bold" style={on ? { background: '#E3F3F0', color: '#0B5F54' } : { background: '#ECEEEA', color: '#5B6670' }}>{n}</span>}
              </button>
            );
          })}
        </div>

        <form onSubmit={apply} className="flex flex-wrap items-end gap-3 border-b border-line-soft bg-canvas-subtle px-5 py-4">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-arang-muted" />
            <label htmlFor="pf-q" className="sr-only">Cari pembayaran</label>
            <input id="pf-q" className="input h-10 bg-white pl-9" placeholder="Cari no. pesanan, workspace, atau pembeli" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-arang-body" htmlFor="pf-basis">Tanggal
            <select id="pf-basis" className="input h-10 w-auto bg-white" value={draft.basis} onChange={(e) => setDraft({ ...draft, basis: e.target.value as 'created' | 'paid' })}><option value="created">Dibuat</option><option value="paid">Dilunasi</option></select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-arang-body" htmlFor="pf-from">Dari<input id="pf-from" type="date" className="input h-10 w-auto bg-white" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-arang-body" htmlFor="pf-to">Sampai<input id="pf-to" type="date" className="input h-10 w-auto bg-white" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary h-10">Terapkan</button>
            <button type="button" className="btn btn-ghost h-10" onClick={reset}>Atur ulang</button>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <span className="text-[13px] text-arang-muted">{data ? `${data.total.toLocaleString('id-ID')} pembayaran` : ''}{loading ? ' · memuat…' : ''}</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-outline btn-sm" disabled={loading} onClick={() => void load()}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Segarkan</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={!!exporting} onClick={() => exportAs('xlsx')}><FileSpreadsheet size={14} /> {exporting === 'xlsx' ? 'Menyiapkan…' : 'Ekspor Excel'}</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={!!exporting} onClick={() => exportAs('csv')}><Download size={14} /> {exporting === 'csv' ? 'Menyiapkan…' : 'Ekspor CSV'}</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-[13.5px]">
            <thead className="border-y border-line bg-canvas-subtle text-[12px] font-semibold text-arang-muted">
              <tr><th className="px-5 py-3">Pesanan</th><th className="px-5 py-3">Paket</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Bukti</th><th className="px-5 py-3 text-right">Aksi</th></tr>
            </thead>
            <tbody>
              {data && data.items.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-14 text-center">
                  <div className="mx-auto flex max-w-[320px] flex-col items-center gap-2 text-arang-muted"><Inbox size={28} /><span className="text-[14px] font-semibold text-arang">Belum ada pembayaran di sini</span><span className="text-[13px]">Tagihan paket dari pengguna akan muncul di daftar ini.</span></div>
                </td></tr>
              )}
              {data?.items.map((p) => {
                const ui = STATUS_UI[p.status];
                const actionable = p.status === 'submitted' || p.status === 'pending' || p.status === 'expired';
                return (
                  <tr key={p.id} className="border-t border-line-soft align-top hover:bg-canvas-subtle">
                    <td className="px-5 py-3.5">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold text-white" style={{ background: 'linear-gradient(135deg,#0F9D8A,#0B5F54)' }}>{p.workspaceName.trim().charAt(0).toUpperCase()}</span>
                        <div className="min-w-0 leading-tight">
                          <div className="font-semibold">{p.workspaceName}</div>
                          <div className="text-xs text-arang-muted">{p.buyerName} · {p.buyerEmail}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-arang-faint">{p.orderId} · {when(p.createdAt)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><span className="font-semibold">{PLAN[p.plan] ?? p.plan}</span><div className="text-xs text-arang-muted">{p.period === 'yearly' ? 'Tahunan' : 'Bulanan'} · {p.seats} anggota</div></td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right"><span className="tabular font-bold">{rupiah(p.amount)}</span>{p.uniqueCode > 0 && <div className="text-[11px] text-arang-muted">kode unik {p.uniqueCode}</div>}</td>
                    <td className="px-5 py-3.5">
                      <Pill bg={ui.bg} fg={ui.fg} className="font-bold">{ui.text}</Pill>
                      {p.reviewNote && <div className="mt-1 max-w-[220px] text-[11.5px] text-arang-muted">{p.reviewerName ? `${p.reviewerName}: ` : ''}{p.reviewNote}</div>}
                      {p.status === 'paid' && p.paidAt && <div className="mt-1 text-[11.5px] text-arang-muted">{when(p.paidAt)}</div>}
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      {p.hasProof ? <button type="button" className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[13px] font-semibold text-brand hover:underline" onClick={() => viewProof(p)}><FileText size={13} /> Lihat</button> : <span className="text-arang-faint">Belum ada</span>}
                      {p.senderName && <div className="mt-1 text-arang-muted">a.n. {p.senderName}{p.method ? ` · ${p.method === 'qris' ? 'QRIS' : 'rekening'}` : ''}</div>}
                      {p.buyerNote && <div className="mt-1 max-w-[180px] text-arang-muted">“{p.buyerNote}”</div>}
                    </td>
                    <td className="px-5 py-3.5">
                      {actionable ? (
                        <div className="flex justify-end gap-1.5">
                          <button type="button" className="btn btn-primary btn-sm" disabled={busyId === p.id} onClick={() => approve(p)} aria-label={`Setujui ${p.orderId}`}><Check size={13} /> Setujui</button>
                          {p.status !== 'expired' && <button type="button" className="btn btn-outline btn-sm" disabled={busyId === p.id} onClick={() => { setRejecting(p); setReason(''); }} aria-label={`Tolak ${p.orderId}`}><X size={13} /> Tolak</button>}
                        </div>
                      ) : <span className="block text-right text-xs text-arang-muted">Selesai</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px]">
            <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>Sebelumnya</button>
            <span className="text-arang-muted">Halaman {page} dari {pages}</span>
            <button type="button" className="btn btn-outline btn-sm" disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>Berikutnya</button>
          </div>
        )}
      </section>

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Tolak pembayaran">
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void reject(); }}>
          <p className="m-0 text-sm text-arang-body">{rejecting?.workspaceName} · {rejecting ? rupiah(rejecting.amount) : ''}. Jelaskan agar pembeli tahu apa yang perlu diperbaiki.</p>
          <label className="flex flex-col gap-1 text-xs font-semibold" htmlFor="rej-note">Alasan penolakan
            <textarea id="rej-note" className="input" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Nominal di bukti tidak sesuai tagihan." autoFocus />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-outline" onClick={() => setRejecting(null)}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={reason.trim().length < 3 || busyId !== null}>Tolak pembayaran</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
