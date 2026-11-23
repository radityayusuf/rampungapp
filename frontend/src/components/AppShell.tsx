import React, { useState } from 'react';
import { BarChart3, Bell, Columns3, CheckSquare, ChevronDown, Clock, Home, Inbox, LogOut, Menu, Plus, Settings, Sparkles, Store, Users, Wallet, X, UserCheck, Zap } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { go, href } from '../store/router';
import type { Route } from '../types';
import { Avatar, Logo } from './ui';
import { fmtClock } from '../lib/format';

const NavLink: React.FC<{ to: string; active?: boolean; icon?: React.ReactNode; children: React.ReactNode; badge?: React.ReactNode; onNavigate?: () => void }> = ({ to, active, icon, children, badge, onNavigate }) => (
  <a
    href={to}
    onClick={onNavigate}
    aria-current={active ? 'page' : undefined}
    className={`flex min-h-[40px] items-center justify-between gap-2 rounded-lg px-3 text-sm ${active ? 'bg-brand-soft font-semibold text-brand-ink' : 'text-arang hover:bg-canvas'}`}
    style={active ? { color: '#0B5F54' } : { color: '#1F2933' }}
  >
    <span className="flex min-w-0 items-center gap-2.5">{icon}<span className="truncate">{children}</span></span>
    {badge}
  </a>
);

const SyncBadge: React.FC = () => {
  const { mode, syncStatus } = useApp();
  const [text, color] = mode === 'local' ? ['Mode lokal · hanya di browser ini', '#8A5A00']
    : syncStatus === 'saving' ? ['Menyimpan ke server...', '#5B6670']
    : syncStatus === 'error' ? ['Gagal menyimpan, mencoba lagi...', '#B42318']
    : ['Tersimpan di server', '#0B5F54'];
  return <span className="px-3 pt-1 text-xs font-semibold" style={{ color }} role="status">● {text}</span>;
};

const Sidebar: React.FC<{ route: Route; close: () => void }> = ({ route, close }) => {
  const { workspace, spaces, projects, notifications, me, canUseModule, setModal, logout, openCreateTask, canManage } = useApp();
  const unread = notifications.filter((n) => n.userId === me.id && !n.read).length;
  const m = workspace.enabledModules;
  const proj = route.page === 'proyek' ? route.projectId : route.page === 'tugas' ? undefined : undefined;
  const planLabel = workspace.plan.charAt(0).toUpperCase() + workspace.plan.slice(1);

  const lock = (k: Parameters<typeof canUseModule>[0]) => (!canUseModule(k) ? <span className="text-xs font-bold text-arang-muted">PRO</span> : null);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <a href={href.beranda} onClick={close}><Logo /></a>
        <button type="button" aria-label="Tutup menu" onClick={close} className="btn-icon border-0 lg:hidden"><X size={18} /></button>
      </div>

      <button type="button" onClick={() => { setModal('pricing'); close(); }} className="flex w-full cursor-pointer items-center justify-between rounded-[10px] border border-line bg-canvas px-3 py-2.5 text-left text-sm font-semibold text-arang">
        <span className="min-w-0"><span className="block truncate">{workspace.name}</span><span className="block text-xs font-normal text-arang-muted">Paket {planLabel}</span></span>
        <ChevronDown size={16} className="text-arang-muted" />
      </button>

      <button type="button" className="btn btn-primary w-full" onClick={() => { openCreateTask(); close(); }}><Plus size={16} />Tugas baru</button>

      <nav aria-label="Menu utama" className="flex flex-col gap-0.5">
        <NavLink to={href.beranda} active={route.page === 'beranda'} icon={<Home size={17} />} onNavigate={close}>Beranda</NavLink>
        <NavLink to={href.tugasSaya} active={route.page === 'tugas-saya'} icon={<CheckSquare size={17} />} onNavigate={close}>Tugas Saya</NavLink>
        <NavLink to={href.inbox} active={route.page === 'inbox'} icon={<Inbox size={17} />} onNavigate={close}
          badge={unread > 0 ? <span className="rounded-full bg-kunyit px-2 text-xs font-bold text-kunyit-ink">{unread}</span> : null}>Inbox</NavLink>
        <NavLink to={href.dashboard} active={route.page === 'dashboard'} icon={<BarChart3 size={17} />} onNavigate={close}>Dashboard</NavLink>
      </nav>

      <div className="flex flex-col gap-0.5">
        <span className="section-label">MODUL BISNIS</span>
        {m.crm && <NavLink to={href.crm()} active={route.page === 'crm'} icon={<Users size={17} />} onNavigate={close}>CRM Klien</NavLink>}
        {m.finance && canManage && <NavLink to={href.keuangan} active={route.page === 'keuangan'} icon={<Wallet size={17} />} onNavigate={close}>Keuangan</NavLink>}
        {m.timeTracking && <NavLink to={href.time} active={route.page === 'time'} icon={<Clock size={17} />} onNavigate={close}>Time Tracking</NavLink>}
        {m.sdm && <NavLink to={href.sdm} active={route.page === 'sdm'} icon={<UserCheck size={17} />} onNavigate={close}>SDM</NavLink>}
        {m.integrations && <NavLink to={href.integrasi} active={route.page === 'integrasi'} icon={<Zap size={17} />} onNavigate={close}>Integrasi</NavLink>}
        {!m.timeTracking && !m.crm && !m.finance && !m.sdm && !m.integrations && <span className="px-3 text-[13px] text-arang-muted">Belum ada modul aktif.</span>}
        <button type="button" onClick={() => { setModal('modules'); close(); }} className="mt-1 flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-3 text-left text-sm font-semibold text-brand hover:bg-canvas"><Store size={16} />Toko modul {lock('crm') && <span className="text-xs font-bold text-arang-muted">PRO</span>}</button>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="section-label">PROYEK</span>
        {spaces.map((s) => {
          const list = projects.filter((p) => p.spaceId === s.id && p.status !== 'completed');
          if (!list.length) return null;
          return (
            <div key={s.id} className="flex flex-col gap-0.5">
              <span className="px-3 pt-1 text-[11px] font-semibold uppercase text-arang-faint" style={{ color: '#5B6670' }}>{s.name}</span>
              {list.map((p) => (
                <NavLink key={p.id} to={href.proyek(p.id)} active={proj === p.id || (route.page === 'proyek' && route.projectId === p.id)} onNavigate={close}>{p.shortName}</NavLink>
              ))}
            </div>
          );
        })}
        <button type="button" onClick={() => { setModal('project'); close(); }} className="mt-1 flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-3 text-left text-sm text-arang-muted hover:bg-canvas"><Plus size={15} />Proyek baru</button>
      </div>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-line-soft pt-3">
        {m.aiAssistant && <button type="button" onClick={() => { setModal('ai'); close(); }} className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-3 text-left text-sm text-arang hover:bg-canvas"><Sparkles size={16} />Asisten AI</button>}
        <NavLink to={href.pengaturan} active={route.page === 'pengaturan'} icon={<Settings size={17} />} onNavigate={close}>Pengaturan</NavLink>
        <SyncBadge />
        <div className="flex items-center gap-2.5 px-3 pt-2">
          <Avatar userId={me.id} size={32} />
          <div className="min-w-0 flex-1 text-[13px] leading-tight"><div className="truncate font-bold">{me.name}</div><div className="truncate text-arang-muted">{me.title}</div></div>
          <button type="button" aria-label="Keluar" title="Keluar" onClick={() => { logout(); go(href.landing); }} className="btn-icon border-0"><LogOut size={16} /></button>
        </div>
      </div>
    </div>
  );
};

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
      <button type="button" aria-label="Tambah tugas" onClick={() => openCreateTask({ projectId: target })} className="flex h-[52px] w-[52px] cursor-pointer items-center justify-center rounded-2xl border-0 bg-brand text-white"><Plus size={26} /></button>
      {item(href.inbox, 'Inbox', route.page === 'inbox', <Bell size={22} />, unread)}
      {target ? item(href.proyek(target), 'Proyek', route.page === 'proyek' || route.page === 'tugas', <Columns3 size={22} />) : null}
    </nav>
  );
};

export const AppShell: React.FC<{ route: Route; children: React.ReactNode }> = ({ route, children }) => {
  const { timer, tasks, timerSeconds, stopTimer, notifications, me } = useApp();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => n.userId === me.id && !n.read).length;
  const running = timer ? tasks.find((t) => t.id === timer.taskId) : null;

  return (
    <div className="flex min-h-screen bg-canvas">
      <button type="button" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:shadow-lg" onClick={() => document.getElementById("konten")?.focus()}>Lewati ke konten</button>
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-line bg-white lg:block"><Sidebar route={route} close={() => undefined} /></aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-arang/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[290px] max-w-[88vw] bg-white shadow-2xl"><Sidebar route={route} close={() => setOpen(false)} /></aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-2.5 lg:hidden">
          <button type="button" aria-label="Buka menu" onClick={() => setOpen(true)} className="btn-icon"><Menu size={18} /></button>
          <Logo size={26} />
          <a href={href.inbox} aria-label="Inbox" className="btn-icon relative"><Bell size={18} />{unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-kunyit px-1.5 text-[10px] font-bold text-kunyit-ink">{unread}</span>}</a>
        </div>

        {running && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-arang px-4 py-2.5 text-white sm:px-8" style={{ color: '#fff' }}>
            <span className="flex min-w-0 items-center gap-2.5 text-sm"><Zap size={15} color="#F2B33D" /><span className="truncate">Timer berjalan: <a href={href.tugas(running.id)} style={{ color: '#fff', fontWeight: 700 }}>{running.title}</a></span></span>
            <span className="flex items-center gap-3"><span className="tabular text-lg font-extrabold">{fmtClock(timerSeconds)}</span><button type="button" onClick={stopTimer} className="btn btn-kunyit h-9 px-4">Hentikan</button></span>
          </div>
        )}

        <main id="konten" tabIndex={-1} className="min-w-0 flex-1 pb-24 outline-none md:pb-0">{children}</main>
        <BottomNav route={route} />
      </div>
    </div>
  );
};
