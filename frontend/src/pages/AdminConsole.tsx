import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowRight, Building2, CheckCircle2, CircleAlert, CreditCard, Database, ExternalLink, LayoutDashboard, LogOut, Menu,
  Layers, RefreshCw, Search, Server, ShieldCheck, Trash2, Users, Wallet, X, XCircle,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { go, href } from '../store/router';
import type { AdminSection } from '../types';
import { api } from '../lib/api';
import type { AdminPaymentList, IntegrationStatus, SystemStats, SystemUser, SystemWorkspace } from '../lib/api';
import { errMsg, fmtDateLong, rupiah } from '../lib/format';
import { Logo } from '../components/ui';
import { AdminPaymentsPanel, PaymentSettingsCard } from '../components/AdminPaymentsPanel';
import { PlansEditor } from '../components/PlansEditor';

/* ───────────────────────── Navigasi panel ───────────────────────── */

const NAV: { group: string; items: { key: AdminSection; label: string; icon: React.ReactNode }[] }[] = [
  { group: 'Ikhtisar', items: [{ key: 'ringkasan', label: 'Dasbor', icon: <LayoutDashboard size={17} /> }] },
  { group: 'Platform', items: [
    { key: 'workspace', label: 'Workspace & paket', icon: <Building2 size={17} /> },
    { key: 'pengguna', label: 'Pengguna', icon: <Users size={17} /> },
    { key: 'paket', label: 'Paket & harga', icon: <Layers size={17} /> },
  ] },
  { group: 'Keuangan', items: [
    { key: 'pembayaran', label: 'Pembayaran', icon: <CreditCard size={17} /> },
    { key: 'pengaturan', label: 'Pengaturan pembayaran', icon: <Wallet size={17} /> },
  ] },
  { group: 'Sistem', items: [{ key: 'sistem', label: 'Kesehatan & integrasi', icon: <Server size={17} /> }] },
];
const TITLE: Record<AdminSection, [string, string]> = {
  ringkasan: ['Dasbor platform', 'Gambaran seluruh Rampung: pengguna, workspace, pendapatan, dan hal yang perlu tindakan.'],
  workspace: ['Workspace & paket', 'Semua workspace di platform beserta paket dan masa aktifnya.'],
  pengguna: ['Pengguna', 'Semua akun terdaftar, peran, dan workspace-nya.'],
  paket: ['Paket & harga', 'Atur harga, batas anggota/proyek/penyimpanan, uji coba, dan isi halaman harga — langsung ditegakkan server.'],
  pembayaran: ['Pembayaran', 'Verifikasi pembelian paket dan ekspor laporan pendapatan.'],
  pengaturan: ['Pengaturan pembayaran', 'QRIS, rekening, dan petunjuk yang dilihat pembeli saat membayar paket.'],
  sistem: ['Kesehatan & integrasi', 'Kondisi server, database, dan layanan pihak ketiga yang terhubung.'],
};
const PLAN_LABEL: Record<string, string> = { gratis: 'Gratis', pro: 'Pro', bisnis: 'Bisnis', enterprise: 'Enterprise' };
const PLAN_COLOR: Record<string, string> = { gratis: '#A9B4BB', pro: '#0F9D8A', bisnis: '#1D5FA8', enterprise: '#F2B33D' };
const ROLE_STYLE: Record<string, [string, string, string]> = {
  superadmin: ['Superadmin', '#F0EBFB', '#5B3AA8'], owner: ['Pemilik', '#E3F3F0', '#0B5F54'], admin: ['Admin', '#E6EFFA', '#1D5FA8'], member: ['Anggota', '#ECEEEA', '#3D4750'],
};

const fmtBytes = (b: number) => (b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(1)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`);
const fmtUptime = (s: number) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return [d && `${d} hari`, h && `${h} jam`, m && `${m} mnt`, `${Math.floor(s % 60)} dtk`].filter(Boolean).join(' ');
};
const day = (iso?: string | null) => (iso ? fmtDateLong(iso.slice(0, 10)) : '–');

/* ───────────────────────── Komponen kecil ───────────────────────── */

const Panel: React.FC<{ title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }> = ({ title, action, children, className = '', pad = true }) => (
  <section className={`overflow-hidden rounded-2xl border border-line bg-white shadow-card ${className}`}>
    {title && <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4"><h2 className="m-0 text-[15px] font-bold">{title}</h2>{action}</div>}
    <div className={pad ? 'p-5' : ''}>{children}</div>
  </section>
);

const Kpi: React.FC<{ label: string; value: React.ReactNode; note?: React.ReactNode; icon: React.ReactNode; tone?: string; to?: string }> = ({ label, value, note, icon, tone = '#0F9D8A', to }) => {
  const body = (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-card transition-shadow hover:shadow-lift sm:p-5">
      <div className="flex items-start justify-between gap-2"><span className="text-[12.5px] font-medium text-arang-muted sm:text-[13px]">{label}</span><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${tone}1A`, color: tone }}>{icon}</span></div>
      <span className="truncate text-[22px] font-extrabold leading-none tracking-tight sm:text-[28px]">{value}</span>
      {note && <span className="text-xs text-arang-muted">{note}</span>}
    </div>
  );
  return to ? <a href={to} className="block" style={{ color: '#1F2933' }}>{body}</a> : body;
};

const RolePill: React.FC<{ role: string }> = ({ role }) => {
  const [l, bg, fg] = ROLE_STYLE[role] ?? [role, '#ECEEEA', '#3D4750'];
  return <span className="inline-flex rounded-md px-2 py-0.5 text-[11.5px] font-bold" style={{ background: bg, color: fg }}>{l}</span>;
};

const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; id: string }> = ({ value, onChange, placeholder, id }) => (
  <div className="relative w-full sm:w-[300px]">
    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-arang-muted" />
    <label htmlFor={id} className="sr-only">{placeholder}</label>
    <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input h-10 pl-9" />
  </div>
);

/** Status paket workspace: aktif sampai tanggal, tanpa batas, atau sudah berakhir (kembali ke Gratis). */
const PlanStatus: React.FC<{ ws: SystemWorkspace }> = ({ ws }) => {
  const expired = ws.plan !== 'gratis' && !!ws.planUntil && new Date(ws.planUntil).getTime() < Date.now();
  const plan = expired ? 'gratis' : ws.plan;
  return (
    <div className="flex flex-col gap-1 leading-tight">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-bold" style={{ background: `${PLAN_COLOR[plan]}22`, color: plan === 'gratis' ? '#3D4750' : PLAN_COLOR[plan] }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: PLAN_COLOR[plan] }} />{PLAN_LABEL[plan]}</span>
      <span className="whitespace-nowrap text-[11.5px] text-arang-muted">{expired ? `Berakhir ${day(ws.planUntil)}` : ws.plan === 'gratis' ? 'Paket bawaan' : ws.planUntil ? `s.d. ${day(ws.planUntil)}` : 'Tanpa batas waktu'}</span>
    </div>
  );
};

/** Superadmin menetapkan paket workspace (mis. Enterprise hasil negosiasi). Tanggal kosong = tanpa batas waktu. */
const PlanCell: React.FC<{ ws: SystemWorkspace; onSaved: () => void }> = ({ ws, onSaved }) => {
  const { notify } = useApp();
  const [plan, setPlan] = useState<string>(ws.plan);
  const [until, setUntil] = useState<string>(ws.planUntil ? ws.planUntil.slice(0, 10) : '');
  const [busy, setBusy] = useState(false);
  const dirty = plan !== ws.plan || until !== (ws.planUntil ? ws.planUntil.slice(0, 10) : '');
  const save = async () => {
    setBusy(true);
    try {
      await api.setWorkspacePlan(ws.id, plan, plan === 'gratis' || !until ? null : new Date(`${until}T23:59:59`).toISOString());
      notify('Paket diperbarui', `${ws.name}: ${PLAN_LABEL[plan]}`, 'success');
      onSaved();
    } catch (e) {
      notify('Gagal mengubah paket', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor={`plan-${ws.id}`}>Paket {ws.name}</label>
      <select id={`plan-${ws.id}`} className="input input-sm w-auto" value={plan} onChange={(e) => setPlan(e.target.value)}>
        {Object.entries(PLAN_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {plan !== 'gratis' && (
        <>
          <label className="sr-only" htmlFor={`until-${ws.id}`}>Berlaku sampai</label>
          <input id={`until-${ws.id}`} type="date" className="input input-sm w-auto" value={until} onChange={(e) => setUntil(e.target.value)} title="Kosongkan untuk tanpa batas waktu" />
        </>
      )}
      {dirty && <button type="button" disabled={busy} onClick={save} className="btn btn-primary btn-sm">{busy ? 'Menyimpan…' : 'Simpan'}</button>}
    </div>
  );
};

/* ───────────────────────── Halaman-halaman ───────────────────────── */

const Dashboard: React.FC<{ stats: SystemStats | null; workspaces: SystemWorkspace[]; users: SystemUser[]; pay: AdminPaymentList | null; review: AdminPaymentList | null }> = ({ stats, workspaces, users, pay, review }) => {
  const byPlan = useMemo(() => {
    const now = Date.now();
    const m: Record<string, number> = { gratis: 0, pro: 0, bisnis: 0, enterprise: 0 };
    for (const w of workspaces) {
      const expired = w.plan !== 'gratis' && w.planUntil && new Date(w.planUntil).getTime() < now;
      m[expired ? 'gratis' : w.plan] = (m[expired ? 'gratis' : w.plan] ?? 0) + 1;
    }
    return m;
  }, [workspaces]);
  const paid = workspaces.length - (byPlan.gratis ?? 0);
  const weekAgo = Date.now() - 7 * 864e5;
  const newUsers = users.filter((u) => u.createdAt && new Date(u.createdAt).getTime() > weekAgo).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label="Total pengguna" value={stats?.totalUsers ?? '–'} note={`${newUsers} baru dalam 7 hari`} icon={<Users size={17} />} to={href.admin('pengguna')} />
        <Kpi label="Workspace" value={stats?.totalWorkspaces ?? '–'} note={`${paid} berbayar · ${byPlan.gratis ?? 0} gratis`} icon={<Building2 size={17} />} tone="#1D5FA8" to={href.admin('workspace')} />
        <Kpi label="Pendapatan (lunas)" value={pay ? rupiah(pay.summary.paidAmount) : '–'} note={`${pay?.summary.paidCount ?? 0} transaksi terverifikasi`} icon={<Wallet size={17} />} tone="#0B7A6B" to={href.admin('pembayaran')} />
        <Kpi label="Menunggu verifikasi" value={pay?.awaitingReviewAll ?? '–'} note={pay?.awaitingReviewAll ? 'Perlu tindakan Anda' : 'Tidak ada antrean'} icon={<CircleAlert size={17} />} tone="#D98A0B" to={href.admin('pembayaran')} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Pembayaran yang menunggu verifikasi" action={<a href={href.admin('pembayaran')} className="inline-flex items-center gap-1 text-[13px] font-semibold">Buka semua <ArrowRight size={14} /></a>} pad={false}>
          {!review?.items.length ? (
            <div className="flex items-center gap-3 px-5 py-8 text-sm text-arang-muted"><CheckCircle2 size={18} className="text-brand" />Tidak ada pembayaran yang menunggu. Semua beres.</div>
          ) : review.items.map((p, i) => (
            <a key={p.id} href={href.admin('pembayaran')} className={`flex items-center gap-4 px-5 py-3.5 hover:bg-canvas-subtle ${i ? 'border-t border-line-soft' : ''}`} style={{ color: '#1F2933' }}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-kunyit-soft" style={{ color: '#8A5A00' }}><CreditCard size={16} /></span>
              <div className="min-w-0 flex-1 leading-tight"><div className="truncate text-[14px] font-semibold">{p.workspaceName}</div><div className="truncate text-xs text-arang-muted">{p.buyerEmail} · {PLAN_LABEL[p.plan] ?? p.plan} {p.period === 'yearly' ? 'tahunan' : 'bulanan'}</div></div>
              <span className="text-[14px] font-bold">{rupiah(p.amount)}</span>
            </a>
          ))}
        </Panel>

        <Panel title="Sebaran paket">
          <div className="flex h-3 overflow-hidden rounded-full bg-line-soft">
            {Object.entries(byPlan).map(([k, n]) => n > 0 && <span key={k} title={`${PLAN_LABEL[k]}: ${n}`} style={{ width: `${(n / Math.max(1, workspaces.length)) * 100}%`, background: PLAN_COLOR[k] }} />)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {Object.entries(byPlan).map(([k, n]) => (
              <div key={k} className="flex items-center justify-between rounded-xl border border-line-soft px-3 py-2.5 text-[13.5px]">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PLAN_COLOR[k] }} />{PLAN_LABEL[k]}</span><b>{n}</b>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Workspace terbaru" action={<a href={href.admin('workspace')} className="text-[13px] font-semibold">Lihat semua</a>} pad={false}>
          {workspaces.slice(0, 6).map((w, i) => (
            <div key={w.id} className={`flex items-center gap-3 px-5 py-3 ${i ? 'border-t border-line-soft' : ''}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-white" style={{ background: 'linear-gradient(135deg,#0F9D8A,#0B5F54)' }}>{w.name.trim().charAt(0).toUpperCase()}</span>
              <div className="min-w-0 flex-1 leading-tight"><div className="truncate text-[14px] font-semibold">{w.name}</div><div className="truncate text-xs text-arang-muted">{w.ownerEmail} · {w.memberCount} anggota</div></div>
              <span className="rounded-md px-2 py-0.5 text-[11.5px] font-bold" style={{ background: `${PLAN_COLOR[w.plan]}22`, color: w.plan === 'gratis' ? '#3D4750' : PLAN_COLOR[w.plan] }}>{PLAN_LABEL[w.plan]}</span>
            </div>
          ))}
          {!workspaces.length && <div className="px-5 py-8 text-sm text-arang-muted">Belum ada workspace.</div>}
        </Panel>
        <Panel title="Kondisi sistem" action={<a href={href.admin('sistem')} className="text-[13px] font-semibold">Detail</a>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Database', stats?.database ?? '–', <Database key="d" size={15} />],
              ['Waktu tanggap DB', stats ? `${stats.dbLatencyMs} ms` : '–', <Activity key="a" size={15} />],
              ['Uptime server', stats ? fmtUptime(stats.serverUptimeSeconds) : '–', <Server key="s" size={15} />],
              ['Penyimpanan berkas', stats ? `${fmtBytes(stats.storageBytes)} · ${stats.totalUploads} berkas` : '–', <Database key="f" size={15} />],
            ].map(([l, v, ic]) => (
              <div key={l as string} className="flex items-start gap-3 rounded-xl border border-line-soft p-3"><span className="mt-0.5 text-brand">{ic}</span><div className="min-w-0 leading-tight"><div className="text-xs text-arang-muted">{l}</div><div className="truncate text-[13.5px] font-semibold">{v}</div></div></div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
};

const WorkspacesPage: React.FC<{ workspaces: SystemWorkspace[]; reload: () => void }> = ({ workspaces, reload }) => {
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('');
  const list = workspaces.filter((w) => (!plan || w.plan === plan) && (!q || `${w.name} ${w.ownerName} ${w.ownerEmail}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox id="cari-ws" value={q} onChange={setQ} placeholder="Cari workspace atau pemilik…" />
          <label className="sr-only" htmlFor="f-plan">Filter paket</label>
          <select id="f-plan" className="input h-10 w-auto" value={plan} onChange={(e) => setPlan(e.target.value)}><option value="">Semua paket</option>{Object.entries(PLAN_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <span className="text-[13px] text-arang-muted">{list.length} workspace</span>
      </div>
      <Panel pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-[13.5px]">
            <thead className="border-b border-line bg-canvas-subtle text-[12px] font-semibold text-arang-muted">
              <tr><th className="px-5 py-3">Workspace</th><th className="px-5 py-3">Pemilik</th><th className="px-5 py-3 text-center">Anggota</th><th className="px-5 py-3">Status paket</th><th className="px-5 py-3">Ubah paket & masa aktif</th><th className="px-5 py-3">Dibuat</th></tr>
            </thead>
            <tbody>
              {list.map((w) => (
                <tr key={w.id} className="border-t border-line-soft align-middle hover:bg-canvas-subtle">
                  <td className="px-5 py-3"><div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-white" style={{ background: 'linear-gradient(135deg,#0F9D8A,#0B5F54)' }}>{w.name.trim().charAt(0).toUpperCase()}</span><div className="leading-tight"><div className="font-semibold">{w.name}</div><div className="text-[11.5px] text-arang-muted">#{w.id} · {w.recordCount} baris data</div></div></div></td>
                  <td className="px-5 py-3"><div className="font-medium">{w.ownerName}</div><div className="text-xs text-arang-muted">{w.ownerEmail}</div></td>
                  <td className="px-5 py-3 text-center">{w.memberCount}</td>
                  <td className="px-5 py-3"><PlanStatus ws={w} /></td>
                  <td className="px-5 py-3"><PlanCell key={`${w.plan}-${w.planUntil}`} ws={w} onSaved={reload} /></td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-arang-muted">{day(w.createdAt)}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={6} className="px-5 py-10 text-center text-arang-muted">Tidak ada workspace yang cocok.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="m-0 text-xs text-arang-muted">Mengubah paket di sini langsung berlaku tanpa pembayaran — gunakan untuk paket Enterprise hasil negosiasi, kompensasi, atau workspace internal. Tanggal kosong berarti tanpa batas waktu.</p>
    </div>
  );
};

const UsersPage: React.FC<{ users: SystemUser[]; setUsers: React.Dispatch<React.SetStateAction<SystemUser[]>> }> = ({ users, setUsers }) => {
  const { notify, account } = useApp();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const list = users.filter((u) => (!role || u.role === role) && (!q || `${u.name} ${u.email} ${u.workspaceName}`.toLowerCase().includes(q.toLowerCase())));

  const changeRole = async (u: SystemUser, r: string) => {
    if (!window.confirm(`Ubah peran ${u.email} menjadi ${ROLE_STYLE[r]?.[0] ?? r}?`)) return;
    try {
      await api.updateSystemUserRole(u.id, r);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: r } : x)));
      notify('Peran diperbarui', `${u.email} sekarang ${ROLE_STYLE[r]?.[0] ?? r}.`, 'success');
    } catch (e) {
      notify('Gagal mengubah peran', errMsg(e));
    }
  };
  const remove = async (u: SystemUser) => {
    if (!window.confirm(`Hapus akun ${u.name} (${u.email}) dari Rampung? Tindakan ini tidak dapat dibatalkan.`)) return;
    setBusy(u.id);
    try {
      await api.deleteSystemUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      notify('Pengguna dihapus', u.email, 'success');
    } catch (e) {
      notify('Gagal menghapus pengguna', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox id="cari-user" value={q} onChange={setQ} placeholder="Cari nama, email, atau workspace…" />
          <label className="sr-only" htmlFor="f-role">Filter peran</label>
          <select id="f-role" className="input h-10 w-auto" value={role} onChange={(e) => setRole(e.target.value)}><option value="">Semua peran</option>{Object.entries(ROLE_STYLE).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <span className="text-[13px] text-arang-muted">{list.length} pengguna</span>
      </div>
      <Panel pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-[13.5px]">
            <thead className="border-b border-line bg-canvas-subtle text-[12px] font-semibold text-arang-muted">
              <tr><th className="px-5 py-3">Pengguna</th><th className="px-5 py-3">Peran</th><th className="px-5 py-3">Workspace</th><th className="px-5 py-3">Terdaftar</th><th className="px-5 py-3 text-right">Aksi</th></tr>
            </thead>
            <tbody>
              {list.map((u) => {
                const self = u.id === account?.id;
                return (
                  <tr key={u.id} className="border-t border-line-soft hover:bg-canvas-subtle">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-arang text-[11px] font-bold text-white">{u.name.split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase()}</span>
                        <div className="min-w-0 leading-tight"><div className="font-semibold">{u.name} {self && <span className="ml-1 rounded bg-kunyit-soft px-1.5 text-[10.5px] font-bold" style={{ color: '#6B4A00' }}>Anda</span>}</div><div className="text-xs text-arang-muted">{u.email}</div></div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {self ? <RolePill role={account?.is_superadmin ? 'superadmin' : u.role} /> : (
                        <>
                          <label className="sr-only" htmlFor={`role-${u.id}`}>Peran {u.name}</label>
                          <select id={`role-${u.id}`} className="input input-sm w-auto" value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                            {Object.entries(ROLE_STYLE).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                          </select>
                        </>
                      )}
                    </td>
                    <td className="px-5 py-3">{u.workspaceName}</td>
                    <td className="px-5 py-3 text-xs text-arang-muted">{day(u.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      {!self && <button type="button" aria-label={`Hapus ${u.email}`} title="Hapus akun" disabled={busy === u.id} onClick={() => remove(u)} className="btn-icon h-8 w-8 border-0 bg-transparent text-arang-muted hover:bg-danger-soft hover:text-danger"><Trash2 size={15} /></button>}
                    </td>
                  </tr>
                );
              })}
              {!list.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-arang-muted">Tidak ada pengguna yang cocok.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="m-0 text-xs text-arang-muted">Peran Superadmin memberi akses ke panel ini. Akun yang emailnya tercantum di SUPERADMIN_EMAILS (dan terverifikasi Google) selalu menjadi Superadmin.</p>
    </div>
  );
};

const SettingsPage: React.FC<{ onSaved: () => void }> = ({ onSaved }) => (
  <div className="flex flex-col gap-6">
    <PaymentSettingsCard onSaved={onSaved} />
    <Panel title="Harga & batas paket">
      <div className="flex flex-wrap items-center justify-between gap-3 text-[13.5px] text-arang-body">
        <span>Harga, batas anggota/proyek/penyimpanan, uji coba, dan isi halaman harga diatur di menu tersendiri.</span>
        <a href={href.admin('paket')} className="btn btn-outline btn-sm" style={{ color: '#1F2933' }}><Layers size={14} />Buka Paket &amp; harga</a>
      </div>
    </Panel>
  </div>
);

/** Pemeliharaan: hapus data contoh lama ("Studio Nusa") yang dulu disuntikkan ke workspace. */
const DemoCleanupPanel: React.FC = () => {
  const { notify } = useApp();
  const [report, setReport] = useState<Awaited<ReturnType<typeof api.demoCleanup>> | null>(null);
  const [busy, setBusy] = useState('');
  const run = async (apply: boolean) => {
    if (apply && !window.confirm(`Hapus ${report?.total ?? ''} catatan data contoh dari ${report?.workspaces.length ?? ''} workspace? Data buatan pengguna tidak ikut terhapus. Tindakan ini tidak bisa dibatalkan.`)) return;
    setBusy(apply ? 'apply' : 'check');
    try {
      const r = await api.demoCleanup(apply);
      setReport(apply ? { ...r, total: 0, workspaces: [] } : r);
      if (apply) notify('Data contoh dihapus', `${r.total} catatan dibersihkan. Pengguna yang sedang membuka Rampung akan melihat perubahan otomatis.`, 'success');
    } catch (e) {
      notify('Gagal memeriksa data contoh', errMsg(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <Panel title="Pemeliharaan: data contoh lama" className="xl:col-span-2">
      <div className="flex flex-col gap-4 text-[13.5px]">
        <p className="m-0 text-arang-body">Versi lama Rampung menyisipkan data contoh (proyek “Website PT Sinar Jaya”, anggota Dimas/Bayu/Nadia, klien, invoice, dll.) ke workspace. Fitur ini sudah dihapus, tetapi data yang terlanjur tersimpan bisa dibersihkan di sini. Hanya catatan yang <b>ID dan isinya sama persis</b> dengan data contoh yang dihapus, beserta komentar/aktivitas yang merujuknya — data buatan pengguna tetap aman.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline btn-sm" disabled={!!busy} onClick={() => run(false)}>{busy === 'check' ? 'Memeriksa…' : 'Periksa data contoh'}</button>
          {report && report.total > 0 && <button type="button" className="btn btn-sm border-0 bg-danger text-white hover:brightness-95" disabled={!!busy} onClick={() => run(true)}>{busy === 'apply' ? 'Menghapus…' : `Hapus ${report.total} catatan data contoh`}</button>}
        </div>
        {report && (report.total === 0 ? (
          <span className="flex items-center gap-2 font-semibold text-brand"><CheckCircle2 size={15} />Tidak ada data contoh. Database sudah bersih.</span>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line">
            {report.workspaces.map((w, i) => (
              <div key={w.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${i ? 'border-t border-line-soft' : ''}`}>
                <span className="font-semibold">{w.name} <span className="font-normal text-arang-muted">#{w.id}</span></span>
                <span className="text-xs text-arang-muted">{w.count} catatan · {Object.entries(w.byCollection).map(([c, n]) => `${c} ${n}`).join(', ')}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
};

const SystemPage: React.FC<{ stats: SystemStats | null }> = ({ stats }) => {
  const [integ, setInteg] = useState<IntegrationStatus | null>(null);
  useEffect(() => { api.integrationStatus().then(setInteg).catch(() => undefined); }, []);
  const row = (l: string, v: React.ReactNode) => <div className="flex items-center justify-between gap-4 border-t border-line-soft py-3 first:border-0 first:pt-0 text-[13.5px]"><span className="text-arang-muted">{l}</span><span className="text-right font-semibold">{v}</span></div>;
  const Status: React.FC<{ on: boolean | null | undefined; yes: string; no: string }> = ({ on, yes, no }) => (
    <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: on ? '#0B5F54' : '#8A5A00' }}>{on ? <CheckCircle2 size={15} /> : <XCircle size={15} />}{on ? yes : no}</span>
  );
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Server & runtime">
        {row('Teknologi', 'Node.js · Express · Prisma')}
        {row('Versi Node', <span className="font-mono">{stats?.nodeVersion ?? '–'}</span>)}
        {row('Memori terpakai', stats ? `${stats.memoryUsageMB} MB` : '–')}
        {row('Uptime', stats ? fmtUptime(stats.serverUptimeSeconds) : '–')}
        {row('Koneksi realtime', stats?.websocket ?? '–')}
      </Panel>
      <Panel title="Database & penyimpanan">
        {row('Mesin database', stats?.database ?? '–')}
        {row('Waktu tanggap', stats ? `${stats.dbLatencyMs} ms` : '–')}
        {row('Baris data tersinkron', stats ? `${stats.totalRecords.toLocaleString('id-ID')} baris` : '–')}
        {row('Berkas unggahan', stats ? `${stats.totalUploads} berkas · ${fmtBytes(stats.storageBytes)}` : '–')}
        {row('Diperiksa', stats ? new Date(stats.timestamp).toLocaleString('id-ID') : '–')}
      </Panel>
      <Panel title="Layanan pihak ketiga" className="xl:col-span-2">
        <div className="grid gap-x-10 md:grid-cols-2">
          <div>
            {row('Login Google', <Status on={integ?.google.configured} yes="Terpasang" no="Belum diisi (GOOGLE_CLIENT_ID)" />)}
            {row('Email (SMTP)', <Status on={integ?.email.configured} yes="Terpasang" no="Belum diisi (SMTP_*)" />)}
            {row('Tujuan pembayaran', <Status on={integ?.payments.configured} yes="QRIS/rekening diatur" no="Belum diatur" />)}
          </div>
          <div>
            {row('WhatsApp Cloud API', <Status on={integ?.whatsapp.configured && integ.whatsapp.reachable !== false} yes={integ?.whatsapp.phoneNumber ? `Terhubung · ${integ.whatsapp.phoneNumber}` : 'Terpasang'} no={integ?.whatsapp.configured ? 'Tidak terjangkau' : 'Belum diisi (WHATSAPP_*)'} />)}
            {row('Asisten AI (Claude)', <Status on={integ?.ai.configured} yes={integ?.ai.model ?? 'Terpasang'} no="Mode template (ANTHROPIC_API_KEY kosong)" />)}
          </div>
        </div>
        <p className="m-0 mt-3 text-xs text-arang-muted">Kunci layanan diisi di <code>backend-node/.env</code>, lalu periksa dengan <code>npm run check:integrations</code>.</p>
      </Panel>
      <DemoCleanupPanel />
    </div>
  );
};

/* ───────────────────────── Kerangka panel ───────────────────────── */

export const AdminConsole: React.FC<{ section: AdminSection }> = ({ section }) => {
  const { account, me, notify, logout, workspace } = useApp();
  const isSuper = account?.is_superadmin === true || me.role === 'superadmin';
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [workspaces, setWorkspaces] = useState<SystemWorkspace[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [pay, setPay] = useState<AdminPaymentList | null>(null);
  const [review, setReview] = useState<AdminPaymentList | null>(null);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(false);
  // Stabil: AdminPaymentsPanel memuat ulang bila referensi callback berubah.
  const onAwaiting = useCallback((n: number) => setPay((p) => (p && p.awaitingReviewAll !== n ? { ...p, awaitingReviewAll: n } : p)), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, w, u, p, r] = await Promise.all([api.getSystemStats(), api.getSystemWorkspaces(), api.getSystemUsers(), api.adminPayments({ pageSize: 1 }), api.adminPayments({ status: 'submitted', pageSize: 5 })]);
      setStats(s); setWorkspaces(w.workspaces); setUsers(u.users); setPay(p); setReview(r);
    } catch (e) {
      notify('Gagal memuat data platform', errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [notify]);
  useEffect(() => { if (isSuper) void load(); }, [isSuper, load]);

  if (!isSuper) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
        <ShieldCheck size={36} className="text-arang-muted" />
        <h1 className="m-0 text-xl font-bold">Khusus Administrator Sistem</h1>
        <p className="m-0 max-w-sm text-sm text-arang-muted">Panel ini hanya untuk pengelola platform Rampung.</p>
        <a href={href.beranda} className="btn btn-primary mt-2" style={{ color: '#fff' }}>Ke workspace saya</a>
      </div>
    );
  }

  const [title, subtitle] = TITLE[section];
  const awaiting = pay?.awaitingReviewAll ?? 0;
  const sidebar = (
    <div className="flex h-full flex-col bg-[#0E171C] text-white" style={{ color: '#fff' }}>
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <a href={href.admin()} aria-label="Dasbor platform"><Logo size={28} dark /></a>
        <button type="button" aria-label="Tutup menu" onClick={() => setMenu(false)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-0 bg-white/10 text-white lg:hidden"><X size={16} /></button>
      </div>
      <div className="mx-5 mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-semibold" style={{ color: '#D7F0EB' }}><ShieldCheck size={14} className="text-[#5EE0C9]" />Panel Superadmin</div>
      <nav aria-label="Menu superadmin" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3">
        {NAV.map((g) => (
          <div key={g.group} className="flex flex-col gap-0.5">
            <span className="px-3 pb-1 text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: '#6F818A' }}>{g.group}</span>
            {g.items.map((it) => {
              const on = section === it.key;
              return (
                <a key={it.key} href={href.admin(it.key)} onClick={() => setMenu(false)} aria-current={on ? 'page' : undefined}
                  className={`relative flex min-h-[40px] items-center justify-between gap-2 rounded-lg px-3 text-[13.5px] font-medium transition-colors ${on ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`} style={{ color: on ? '#fff' : '#AEBAC1' }}>
                  {on && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-[#5EE0C9]" />}
                  <span className="flex items-center gap-2.5"><span style={{ color: on ? '#5EE0C9' : '#7F9099' }}>{it.icon}</span>{it.label}</span>
                  {it.key === 'pembayaran' && awaiting > 0 && <span className="rounded-full bg-[#F2B33D] px-1.5 text-[11px] font-bold" style={{ color: '#2A1D00' }}>{awaiting}</span>}
                </a>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="flex flex-col gap-2 border-t border-white/10 p-3">
        <a href={href.beranda} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] font-medium hover:bg-white/5" style={{ color: '#AEBAC1' }}>
          <span className="min-w-0"><span className="block text-[11px]" style={{ color: '#6F818A' }}>Workspace pribadi</span><span className="block truncate">{workspace.name || 'Buka workspace saya'}</span></span><ExternalLink size={14} />
        </a>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F2B33D] text-[11px] font-black" style={{ color: '#2A1D00' }}>{me.initials}</span>
          <div className="min-w-0 flex-1 leading-tight"><div className="truncate text-[13px] font-semibold">{me.name}</div><div className="truncate text-[11.5px]" style={{ color: '#7F9099' }}>{account?.email}</div></div>
          <button type="button" aria-label="Keluar" title="Keluar" onClick={() => { logout(); go(href.landing); }} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent hover:bg-white/10" style={{ color: '#AEBAC1' }}><LogOut size={15} /></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F4F6F5]">
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 lg:block">{sidebar}</aside>
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenu(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[88vw]">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-8">
          <button type="button" aria-label="Buka menu" onClick={() => setMenu(true)} className="btn-icon border-0 lg:hidden"><Menu size={18} /></button>
          <nav aria-label="Jejak halaman" className="flex min-w-0 items-center gap-1.5 text-[13px] text-arang-muted">
            <span className="hidden sm:inline">Panel Superadmin</span><span aria-hidden="true" className="hidden sm:inline">/</span>
            <span className="truncate font-semibold text-arang">{title}</span>
          </nav>
          <div className="flex-1" />
          <a href={href.landing} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold hover:bg-canvas md:inline-flex" style={{ color: '#3D4750' }}><ExternalLink size={14} />Lihat situs</a>
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Muat ulang data" title="Muat ulang data" className="btn btn-outline btn-sm"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /><span className="hidden sm:inline">{loading ? 'Memuat…' : 'Muat ulang'}</span></button>
          <span title={account?.email} className="ml-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F2B33D] text-[11.5px] font-black sm:flex" style={{ color: '#2A1D00' }}>{me.initials}</span>
        </header>

        <main id="konten" className="mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-4 pb-12 pt-7 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-6">
            <div className="flex max-w-[760px] flex-col gap-1.5">
              <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-brand">{NAV.find((g) => g.items.some((i) => i.key === section))?.group}</span>
              <h1 className="m-0 text-[28px] font-extrabold leading-tight tracking-[-0.02em]">{title}</h1>
              <p className="m-0 text-[14px] leading-relaxed text-arang-muted">{subtitle}</p>
            </div>
            <span className="text-[13px] text-arang-muted">{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
          {section === 'ringkasan' && <Dashboard stats={stats} workspaces={workspaces} users={users} pay={pay} review={review} />}
          {section === 'workspace' && <WorkspacesPage workspaces={workspaces} reload={() => void load()} />}
          {section === 'pengguna' && <UsersPage users={users} setUsers={setUsers} />}
          {section === 'paket' && <PlansEditor />}
          {section === 'pembayaran' && <AdminPaymentsPanel withSettings={false} onAwaiting={onAwaiting} />}
          {section === 'pengaturan' && <SettingsPage onSaved={() => void load()} />}
          {section === 'sistem' && <SystemPage stats={stats} />}
        </main>
      </div>
    </div>
  );
};
