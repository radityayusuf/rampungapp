import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3, Bell, CalendarDays, CheckSquare, ChevronDown, Clock, Columns3, FileText, Home, Inbox, LayoutGrid, List, LogOut, Menu, Plus, Search,
  Settings, Shield, Sparkles, Store, Table2, UserCheck, Users, Wallet, X, Zap, ChartNoAxesGantt,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { go, href } from '../store/router';
import type { ProjectView, Route } from '../types';
import { Avatar, Logo } from './ui';
import { NotificationPanel } from './NotificationPanel';
import { fmtClock, fmtDate, projectPrefix } from '../lib/format';

/** Tampilan proyek di sidebar (sama dengan rute #/proyek/:id/:tampilan). */
export const PROJECT_VIEWS: { key: ProjectView; label: string; icon: React.ReactNode }[] = [
  { key: 'kanban', label: 'Papan', icon: <Columns3 size={16} /> },
  { key: 'list', label: 'Daftar', icon: <List size={16} /> },
  { key: 'kalender', label: 'Kalender', icon: <CalendarDays size={16} /> },
  { key: 'timeline', label: 'Linimasa', icon: <ChartNoAxesGantt size={16} /> },
  { key: 'tabel', label: 'Tabel', icon: <Table2 size={16} /> },
  { key: 'docs', label: 'Dokumen', icon: <FileText size={16} /> },
];

/* ───────────────────────── Sidebar ───────────────────────── */

const SideLink: React.FC<{ to: string; active?: boolean; icon?: React.ReactNode; children: React.ReactNode; badge?: React.ReactNode; onNavigate?: () => void }> = ({ to, active, icon, children, badge, onNavigate }) => (
  <a
    href={to}
    onClick={onNavigate}
    aria-current={active ? 'page' : undefined}
    className={`relative flex min-h-[36px] items-center justify-between gap-2 rounded-lg px-3 text-[13.5px] transition-colors ${active ? 'bg-brand-soft font-semibold' : 'hover:bg-line-soft'}`}
    style={{ color: active ? '#0B5F54' : '#3D4750' }}
  >
    {active && <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-brand-bright" />}
    <span className="flex min-w-0 items-center gap-2.5"><span className={active ? 'text-brand' : 'text-arang-muted'}>{icon}</span><span className="truncate">{children}</span></span>
    {badge}
  </a>
);

const SyncBadge: React.FC = () => {
  const { mode, syncStatus } = useApp();
  const [text, color] = mode === 'local' ? ['Belum masuk', '#8A5A00']
    : syncStatus === 'saving' ? ['Menyimpan ke server...', '#5B6670']
    : syncStatus === 'error' ? ['Gagal menyimpan, mencoba lagi...', '#B42318']
    : ['Tersimpan di server', '#0B5F54'];
  return <span className="px-3 pt-1 text-xs font-medium" style={{ color }} role="status">● {text}</span>;
};

const ProjectHeader: React.FC<{ name: string; shortName: string; clientName?: string }> = ({ name, shortName, clientName }) => (
  <div className="flex items-center gap-3 px-3 pb-3 pt-1">
    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold text-white shadow-sm" style={{ background: 'linear-gradient(135deg,#0F9D8A,#0B5F54)' }}>{name.trim().charAt(0).toUpperCase()}</span>
    <div className="min-w-0 leading-tight">
      <div className="truncate text-sm font-bold text-arang">{name}</div>
      <div className="truncate text-xs text-arang-muted">{clientName ?? 'Proyek internal'} · {projectPrefix(shortName)}</div>
    </div>
  </div>
);

const Sidebar: React.FC<{ route: Route; close: () => void }> = ({ route, close }) => {
  const { workspace, spaces, projects, tasks, clients, notifications, me, canUseModule, setModal, canManage } = useApp();
  const unread = notifications.filter((n) => n.userId === me.id && !n.read).length;
  const m = workspace.enabledModules;
  const projectId = route.page === 'proyek' ? route.projectId : route.page === 'tugas' ? tasks.find((t) => t.id === route.taskId)?.projectId : undefined;
  const project = projects.find((p) => p.id === projectId);
  const view: ProjectView | undefined = route.page === 'proyek' ? route.view : undefined;
  const planLabel = workspace.plan.charAt(0).toUpperCase() + workspace.plan.slice(1);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <div className="flex items-center justify-between lg:hidden">
        <a href={href.beranda} onClick={close}><Logo /></a>
        <button type="button" aria-label="Tutup menu" onClick={close} className="btn-icon border-0"><X size={18} /></button>
      </div>

      {project ? (
        <>
          <div className="flex flex-col gap-1">
            <a href={href.dashboard} onClick={close} className="px-3 pb-2 text-xs font-semibold text-arang-muted hover:text-brand">← Semua proyek</a>
            <ProjectHeader name={project.name} shortName={project.shortName} clientName={clients.find((c) => c.id === project.clientId)?.company} />
          </div>
          <nav aria-label="Navigasi proyek" className="flex flex-col gap-0.5">
            <span className="section-label">PERENCANAAN &amp; PELAKSANAAN</span>
            {PROJECT_VIEWS.map((v) => (
              <SideLink key={v.key} to={href.proyek(project.id, v.key)} active={view === v.key} icon={v.icon} onNavigate={close}>{v.label}</SideLink>
            ))}
          </nav>
          <div className="flex flex-col gap-0.5">
            <span className="section-label">PINTASAN</span>
            <SideLink to={href.tugasSaya} icon={<CheckSquare size={16} />} onNavigate={close}>Pekerjaan saya</SideLink>
            <SideLink to={href.inbox} icon={<Inbox size={16} />} onNavigate={close} badge={unread > 0 ? <span className="rounded-full bg-kunyit px-1.5 text-[11px] font-bold text-kunyit-ink">{unread}</span> : null}>Kotak masuk</SideLink>
          </div>
        </>
      ) : (
        <>
          <nav aria-label="Menu utama" className="flex flex-col gap-0.5">
            <span className="section-label">RUANG KERJA</span>
            <SideLink to={href.beranda} active={route.page === 'beranda'} icon={<Home size={16} />} onNavigate={close}>Beranda</SideLink>
            <SideLink to={href.tugasSaya} active={route.page === 'tugas-saya'} icon={<CheckSquare size={16} />} onNavigate={close}>Tugas Saya</SideLink>
            <SideLink to={href.inbox} active={route.page === 'inbox'} icon={<Inbox size={16} />} onNavigate={close}
              badge={unread > 0 ? <span className="rounded-full bg-kunyit px-1.5 text-[11px] font-bold text-kunyit-ink">{unread}</span> : null}>Inbox</SideLink>
            <SideLink to={href.dashboard} active={route.page === 'dashboard'} icon={<BarChart3 size={16} />} onNavigate={close}>Dashboard</SideLink>
          </nav>

          <div className="flex flex-col gap-0.5">
            <span className="section-label">MODUL BISNIS</span>
            {m.crm && <SideLink to={href.crm()} active={route.page === 'crm'} icon={<Users size={16} />} onNavigate={close}>CRM Klien</SideLink>}
            {m.finance && canManage && <SideLink to={href.keuangan} active={route.page === 'keuangan'} icon={<Wallet size={16} />} onNavigate={close}>Keuangan</SideLink>}
            {m.timeTracking && <SideLink to={href.time} active={route.page === 'time'} icon={<Clock size={16} />} onNavigate={close}>Time Tracking</SideLink>}
            {m.sdm && <SideLink to={href.sdm} active={route.page === 'sdm'} icon={<UserCheck size={16} />} onNavigate={close}>SDM</SideLink>}
            {m.integrations && <SideLink to={href.integrasi} active={route.page === 'integrasi'} icon={<Zap size={16} />} onNavigate={close}>Integrasi</SideLink>}
            {!m.timeTracking && !m.crm && !m.finance && !m.sdm && !m.integrations && <span className="px-3 text-[13px] text-arang-muted">Belum ada modul aktif.</span>}
            <button type="button" onClick={() => { setModal('modules'); close(); }} className="mt-0.5 flex min-h-[36px] cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-3 text-left text-[13.5px] font-semibold text-brand hover:bg-line-soft"><Store size={16} />Toko modul {!canUseModule('crm') && <span className="text-[11px] font-bold text-arang-muted">PRO</span>}</button>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="section-label">PROYEK</span>
            {[...spaces, { id: '__lain', name: 'Lainnya' }].map((s) => {
              const list = projects.filter((p) => p.status !== 'completed' && (s.id === '__lain' ? !spaces.some((x) => x.id === p.spaceId) : p.spaceId === s.id));
              if (!list.length) return null;
              return (
                <div key={s.id} className="flex flex-col gap-0.5">
                  <span className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-wide text-arang-muted">{s.name}</span>
                  {list.map((p) => (
                    <SideLink key={p.id} to={href.proyek(p.id)} onNavigate={close} icon={<span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-extrabold text-white" style={{ background: '#0F9D8A' }}>{p.name.trim().charAt(0).toUpperCase()}</span>}>{p.shortName}</SideLink>
                  ))}
                </div>
              );
            })}
            <button type="button" onClick={() => { setModal('project'); close(); }} className="mt-0.5 flex min-h-[36px] cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-3 text-left text-[13.5px] text-arang-muted hover:bg-line-soft"><Plus size={15} />Proyek baru</button>
          </div>
        </>
      )}

      <div className="mt-auto flex flex-col gap-2 border-t border-line-soft pt-3">
        <button type="button" onClick={() => { setModal('pricing'); close(); }} className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-left shadow-[0_1px_2px_rgba(16,24,40,.04)] hover:border-line-strong">
          <span className="min-w-0"><span className="block truncate text-[13px] font-bold">{workspace.name}</span><span className="block text-xs text-arang-muted">Paket {planLabel}{workspace.planUntil ? ` · s.d. ${fmtDate(workspace.planUntil.slice(0, 10))}` : ''}</span></span>
          <ChevronDown size={15} className="text-arang-muted" />
        </button>
        <SyncBadge />
      </div>
    </div>
  );
};

/* ───────────────────────── Bar atas ───────────────────────── */

/** Menu tarik-turun sederhana: tutup saat klik di luar atau Escape. */
const Dropdown: React.FC<{ label: React.ReactNode; ariaLabel: string; active?: boolean; align?: 'left' | 'right'; button?: 'text' | 'icon'; children: (close: () => void) => React.ReactNode }> = ({ label, ariaLabel, active, align = 'left', button = 'text', children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={button === 'icon'
          ? 'flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent hover:bg-line-soft'
          : `flex h-9 cursor-pointer items-center gap-1 rounded-lg border-0 px-3 text-[13.5px] font-semibold hover:bg-line-soft ${active ? 'bg-brand-soft' : 'bg-transparent'}`}
        style={button === 'text' ? { color: active ? '#0B5F54' : '#3D4750' } : undefined}
      >
        {label}{button === 'text' && <ChevronDown size={14} className="text-arang-muted" />}
      </button>
      {open && (
        <div role="menu" className={`absolute top-[calc(100%+6px)] z-50 min-w-[240px] max-w-[320px] rounded-xl border border-line bg-white p-1.5 shadow-pop ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

const MenuItem: React.FC<{ to?: string; onClick?: () => void; icon?: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode; danger?: boolean }> = ({ to, onClick, icon, children, hint, danger }) => {
  const cls = 'flex min-h-[36px] w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 text-left text-[13.5px] hover:bg-canvas';
  const color = danger ? '#B42318' : '#1F2933';
  const inner = (<><span className="text-arang-muted">{icon}</span><span className="min-w-0 flex-1 truncate">{children}</span>{hint && <span className="text-xs text-arang-muted">{hint}</span>}</>);
  return to
    ? <a role="menuitem" href={to} onClick={onClick} className={cls} style={{ color }}>{inner}</a>
    : <button type="button" role="menuitem" onClick={onClick} className={cls} style={{ color }}>{inner}</button>;
};

const TopLink: React.FC<{ to: string; active: boolean; children: React.ReactNode }> = ({ to, active, children }) => (
  <a href={to} aria-current={active ? 'page' : undefined} className={`flex h-9 items-center rounded-lg px-3 text-[13.5px] font-semibold hover:bg-line-soft ${active ? 'bg-brand-soft' : ''}`} style={{ color: active ? '#0B5F54' : '#3D4750' }}>{children}</a>
);

const TopBar: React.FC<{ route: Route; openMenu: () => void }> = ({ route, openMenu }) => {
  const { workspace, projects, notifications, me, account, setModal, openCreateTask, logout, canManage } = useApp();
  const unread = notifications.filter((n) => n.userId === me.id && !n.read).length;
  const m = workspace.enabledModules;
  const isSuperAdmin = account?.is_superadmin === true || me.role === 'superadmin'; // ditentukan server, bukan daftar email di klien
  const planLabel = workspace.plan.charAt(0).toUpperCase() + workspace.plan.slice(1);
  const projectPage = route.page === 'proyek' || route.page === 'tugas';
  const [notifOpen, setNotifOpen] = useState(false);
  const closeNotif = useCallback(() => setNotifOpen(false), []);
  const moduleItems = [
    m.crm && { to: href.crm(), label: 'CRM Klien', icon: <Users size={15} /> },
    m.finance && canManage && { to: href.keuangan, label: 'Keuangan', icon: <Wallet size={15} /> },
    m.timeTracking && { to: href.time, label: 'Time Tracking', icon: <Clock size={15} /> },
    m.sdm && { to: href.sdm, label: 'SDM', icon: <UserCheck size={15} /> },
    m.integrations && { to: href.integrasi, label: 'Integrasi', icon: <Zap size={15} /> },
  ].filter(Boolean) as { to: string; label: string; icon: React.ReactNode }[];

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-1.5 border-b border-line bg-white/95 px-3 backdrop-blur sm:px-4">
      <button type="button" aria-label="Buka menu" onClick={openMenu} className="btn-icon border-0 lg:hidden"><Menu size={18} /></button>
      <a href={href.beranda} aria-label="Rampung — beranda" className="mr-1 flex items-center rounded-lg px-1 py-1 hover:bg-line-soft"><span className="sm:hidden"><Logo size={28} onlyMark /></span><span className="hidden sm:inline"><Logo size={26} /></span></a>

      <nav aria-label="Navigasi utama" className="hidden items-center gap-0.5 lg:flex">
        <TopLink to={href.tugasSaya} active={route.page === 'tugas-saya'}>Pekerjaan Saya</TopLink>
        <Dropdown label="Proyek" ariaLabel="Menu proyek" active={projectPage}>
          {(close) => (
            <>
              <span className="section-label px-2.5 pt-1">PROYEK TERBARU</span>
              {[...projects].reverse().filter((p) => p.status !== 'completed').slice(0, 6).map((p) => <MenuItem key={p.id} to={href.proyek(p.id)} onClick={close} icon={<span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-extrabold text-white" style={{ background: '#0F9D8A' }}>{p.name.trim().charAt(0).toUpperCase()}</span>}>{p.name}</MenuItem>)}
              {!projects.length && <span className="block px-2.5 py-2 text-[13px] text-arang-muted">Belum ada proyek.</span>}
              <div className="my-1 border-t border-line-soft" />
              <MenuItem to={href.dashboard} onClick={close} icon={<LayoutGrid size={15} />}>Lihat semua proyek</MenuItem>
              <MenuItem onClick={() => { close(); setModal('project'); }} icon={<Plus size={15} />}>Buat proyek</MenuItem>
            </>
          )}
        </Dropdown>
        <TopLink to={href.dashboard} active={route.page === 'dashboard'}>Dasbor</TopLink>
        {moduleItems.length > 0 && (
          <Dropdown label="Modul" ariaLabel="Menu modul" active={['crm', 'keuangan', 'time', 'sdm', 'integrasi'].includes(route.page)}>
            {(close) => moduleItems.map((i) => <MenuItem key={i.to} to={i.to} onClick={close} icon={i.icon}>{i.label}</MenuItem>)}
          </Dropdown>
        )}
      </nav>

      <button type="button" className="btn btn-primary btn-sm ml-1.5" onClick={() => openCreateTask()}><Plus size={15} />Buat</button>

      <div className="flex-1" />

      <button
        type="button"
        id="btn-sidebar-search"
        onClick={() => setModal('command')}
        className="hidden h-9 w-[260px] cursor-pointer items-center justify-between rounded-lg border border-line bg-canvas px-3 text-[13px] text-arang-muted transition hover:border-line-strong hover:bg-white md:flex"
      >
        <span className="flex items-center gap-2"><Search size={14} />Cari apa saja…</span>
        <kbd className="rounded border border-line bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold">Ctrl K</kbd>
      </button>
      <button type="button" aria-label="Pencarian cepat" onClick={() => setModal('command')} className="btn-icon border-0 md:hidden"><Search size={18} /></button>

      {m.aiAssistant && <button type="button" aria-label="Asisten AI" title="Asisten AI" onClick={() => setModal('ai')} className="btn-icon hidden border-0 bg-transparent sm:inline-flex"><Sparkles size={17} /></button>}
      <button type="button" onClick={() => setNotifOpen(true)} aria-label={`Notifikasi${unread ? `, ${unread} belum dibaca` : ''}`} title="Notifikasi" className="btn-icon relative border-0 bg-transparent"><Bell size={17} />{unread > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-kunyit px-1 text-[10px] font-bold text-kunyit-ink">{unread}</span>}</button>
      <NotificationPanel open={notifOpen} onClose={closeNotif} />
      <a href={href.pengaturan} aria-label="Pengaturan" title="Pengaturan" className="btn-icon hidden border-0 bg-transparent sm:inline-flex" style={route.page === 'pengaturan' ? { background: '#E3F3F0' } : undefined}><Settings size={17} /></a>

      <Dropdown button="icon" align="right" ariaLabel="Menu akun" label={<Avatar userId={me.id} size={30} />}>
        {(close) => (
          <>
            <div className="flex items-center gap-3 px-2.5 pb-2 pt-1.5">
              <Avatar userId={me.id} size={38} />
              <div className="min-w-0 leading-tight"><div className="truncate text-sm font-bold">{me.name}</div><div className="truncate text-xs text-arang-muted">{me.email || me.title}</div></div>
            </div>
            <div className="mx-1 mb-1 rounded-lg bg-canvas px-2.5 py-2 text-xs"><span className="text-arang-muted">Workspace</span><div className="truncate text-[13px] font-semibold">{workspace.name} · Paket {planLabel}</div></div>
            {isSuperAdmin && <MenuItem to={href.admin()} onClick={close} icon={<Shield size={15} />}>Panel Superadmin</MenuItem>}
            <MenuItem onClick={() => { close(); setModal('pricing'); }} icon={<Store size={15} />}>Kelola paket</MenuItem>
            <MenuItem to={href.pengaturan} onClick={close} icon={<Settings size={15} />}>Pengaturan</MenuItem>
            <div className="my-1 border-t border-line-soft" />
            <MenuItem danger onClick={() => { close(); logout(); go(href.landing); }} icon={<LogOut size={15} />}>Keluar</MenuItem>
          </>
        )}
      </Dropdown>
    </header>
  );
};

/* ───────────────────────── Navigasi bawah (ponsel) ───────────────────────── */

const BottomNav: React.FC<{ route: Route }> = ({ route }) => {
  const { projects, tasks, openCreateTask, notifications, me } = useApp();
  const unread = notifications.filter((n) => n.userId === me.id && !n.read).length;
  const currentProject = route.page === 'proyek' ? route.projectId : route.page === 'tugas' ? tasks.find((t) => t.id === route.taskId)?.projectId : undefined;
  const target = currentProject ?? projects.find((p) => p.status === 'active')?.id ?? projects[0]?.id;
  const item = (to: string, label: string, active: boolean, icon: React.ReactNode, badge?: number) => (
    <a href={to} aria-current={active ? 'page' : undefined} className="relative flex w-[60px] flex-col items-center gap-1 text-[11px] font-semibold" style={{ color: active ? '#0B7A6B' : '#5B6670' }}>
      {icon}{label}
      {!!badge && <span className="absolute -top-0.5 right-2 rounded-full bg-kunyit px-1.5 text-[10px] font-bold" style={{ color: '#3D2A00' }}>{badge}</span>}
    </a>
  );
  return (
    <nav aria-label="Navigasi bawah" className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-line bg-white px-2 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 md:hidden">
      {item(href.beranda, 'Beranda', route.page === 'beranda', <Home size={22} />)}
      {item(href.tugasSaya, 'Tugas', route.page === 'tugas-saya', <CheckSquare size={22} />)}
      <button type="button" aria-label="Tambah tugas" onClick={() => openCreateTask({ projectId: target })} className="flex h-[52px] w-[52px] cursor-pointer items-center justify-center rounded-2xl border-0 bg-brand text-white shadow-md"><Plus size={26} /></button>
      {item(href.inbox, 'Inbox', route.page === 'inbox', <Bell size={22} />, unread)}
      {target ? item(href.proyek(target), 'Proyek', route.page === 'proyek' || route.page === 'tugas', <Columns3 size={22} />) : null}
    </nav>
  );
};

/* ───────────────────────── Kerangka ───────────────────────── */

export const AppShell: React.FC<{ route: Route; children: React.ReactNode }> = ({ route, children }) => {
  const { timer, tasks, timerSeconds, stopTimer, setModal } = useApp();
  const [open, setOpen] = useState(false);
  const running = timer ? tasks.find((t) => t.id === timer.taskId) : null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setModal('command');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setModal]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <button type="button" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:shadow-lg" onClick={() => document.getElementById('konten')?.focus()}>Lewati ke konten</button>
      <TopBar route={route} openMenu={() => setOpen(true)} />

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-arang/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[290px] max-w-[88vw] bg-white shadow-2xl"><Sidebar route={route} close={() => setOpen(false)} /></aside>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside aria-label="Sidebar" className="sticky top-14 hidden h-[calc(100vh-56px)] w-[248px] shrink-0 border-r border-line bg-[#FAFBF9] lg:block"><Sidebar route={route} close={() => undefined} /></aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {running && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-arang px-4 py-2 text-white sm:px-8" style={{ color: '#fff' }}>
              <span className="flex min-w-0 items-center gap-2.5 text-sm"><Zap size={15} color="#F2B33D" /><span className="truncate">Timer berjalan: <a href={href.tugas(running.id)} style={{ color: '#fff', fontWeight: 700 }}>{running.title}</a></span></span>
              <span className="flex items-center gap-3"><span className="tabular text-lg font-extrabold">{fmtClock(timerSeconds)}</span><button type="button" onClick={stopTimer} className="btn btn-kunyit btn-sm">Hentikan</button></span>
            </div>
          )}
          <main id="konten" tabIndex={-1} className="min-w-0 flex-1 pb-24 outline-none md:pb-0">{children}</main>
        </div>
      </div>
      <BottomNav route={route} />
    </div>
  );
};
