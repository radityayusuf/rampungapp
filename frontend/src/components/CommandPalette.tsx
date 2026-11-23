import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CheckSquare,
  Clock,
  Folder,
  Inbox,
  PlusSquare,
  Search,
  Settings,
  Sparkles,
  UserCheck,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { go, href } from '../store/router';
import { formatTaskKey } from '../lib/format';
import { STATUS } from '../lib/meta';

interface PaletteItem {
  id: string;
  category: 'AKSI CEPAT' | 'TIKET & TUGAS (JIRA)' | 'PROYEK' | 'KLIEN CRM';
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: { bg: string; text: string };
  icon: React.ReactNode;
  onSelect: () => void;
}

export const CommandPalette: React.FC = () => {
  const {
    modal,
    setModal,
    tasks,
    projects,
    clients,
    workspace,
    timer,
    stopTimer,
    openCreateTask,
    checkIn,
    notify,
  } = useApp();

  const [q, setQ] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isOpen = modal === 'command';

  // Listen to global Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setModal(isOpen ? null : 'command');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setModal]);

  // Focus input & reset query on open
  useEffect(() => {
    if (isOpen) {
      setQ('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const items = useMemo(() => {
    if (!isOpen) return [];
    const query = q.toLowerCase().trim();
    const result: PaletteItem[] = [];

    // 1. Aksi Cepat
    const actions: PaletteItem[] = [
      {
        id: 'act-new-task',
        category: 'AKSI CEPAT',
        title: 'Buat Tugas Baru',
        subtitle: 'Buka dialog pembuatan tiket tugas proyek',
        badge: 'Cepat',
        badgeColor: { bg: '#E3F3F0', text: '#0B5F54' },
        icon: <PlusSquare size={16} className="text-teal-600" />,
        onSelect: () => openCreateTask(),
      },
      {
        id: 'act-new-proj',
        category: 'AKSI CEPAT',
        title: 'Buat Proyek Baru',
        subtitle: 'Inisialisasi workspace proyek baru',
        icon: <Folder size={16} className="text-blue-600" />,
        onSelect: () => setModal('project'),
      },
      {
        id: 'act-timer',
        category: 'AKSI CEPAT',
        title: timer ? 'Hentikan Timer Berjalan' : 'Buka Time Tracking',
        subtitle: timer ? 'Hentikan perekaman waktu tugas saat ini' : 'Lihat lembar jam kerja tim (timesheet)',
        badge: timer ? 'Aktif' : undefined,
        badgeColor: timer ? { bg: '#FEF3C7', text: '#92400E' } : undefined,
        icon: <Clock size={16} className="text-amber-600" />,
        onSelect: () => {
          if (timer) {
            stopTimer();
            notify('Timer dihentikan');
          } else {
            go(href.time);
          }
        },
      },
      {
        id: 'act-checkin',
        category: 'AKSI CEPAT',
        title: 'Presensi Check-in Hari Ini',
        subtitle: 'Catat jam hadir kerja ke modul SDM',
        icon: <UserCheck size={16} className="text-emerald-600" />,
        onSelect: () => checkIn(),
      },
      {
        id: 'act-crm-pipeline',
        category: 'AKSI CEPAT',
        title: 'Buka CRM Pipeline & Deals',
        subtitle: 'Kelola alur prospek dan deal penjualan',
        icon: <Users size={16} className="text-indigo-600" />,
        onSelect: () => go(href.crm('pipeline')),
      },
      {
        id: 'act-crm-clients',
        category: 'AKSI CEPAT',
        title: 'Daftar Klien CRM',
        subtitle: 'Data kontak, WhatsApp, dan histori klien',
        icon: <Users size={16} className="text-cyan-600" />,
        onSelect: () => go(href.crm('klien')),
      },
      {
        id: 'act-finance-invoice',
        category: 'AKSI CEPAT',
        title: 'Keuangan: Buat Tagihan / Invoice',
        subtitle: 'Kelola pembayaran QRIS dan tagihan klien',
        icon: <Wallet size={16} className="text-violet-600" />,
        onSelect: () => go(href.keuangan),
      },
      {
        id: 'act-dashboard',
        category: 'AKSI CEPAT',
        title: 'Dashboard Analisis & Metrik',
        subtitle: 'Grafik burndown, beban kerja, dan ringkasan tim',
        icon: <BarChart3 size={16} className="text-slate-600" />,
        onSelect: () => go(href.dashboard),
      },
      {
        id: 'act-inbox',
        category: 'AKSI CEPAT',
        title: 'Kotak Masuk (Inbox Notifikasi)',
        subtitle: 'Lihat mention dan riwayat tugas terbaru',
        icon: <Inbox size={16} className="text-sky-600" />,
        onSelect: () => go(href.inbox),
      },
      {
        id: 'act-ai',
        category: 'AKSI CEPAT',
        title: 'Asisten AI Pemecah Tugas',
        subtitle: 'Pecah tugas otomatis atau buat ringkasan proyek',
        badge: 'AI',
        badgeColor: { bg: '#FDF4FF', text: '#A21CAF' },
        icon: <Sparkles size={16} className="text-fuchsia-600" />,
        onSelect: () => setModal('ai'),
      },
      {
        id: 'act-settings',
        category: 'AKSI CEPAT',
        title: 'Pengaturan Workspace & Anggota',
        subtitle: 'Kelola tim, integrasi, dan profil',
        icon: <Settings size={16} className="text-gray-600" />,
        onSelect: () => go(href.pengaturan),
      },
    ];

    const matchedActions = !query
      ? actions.slice(0, 4)
      : actions.filter(
          (a) =>
            a.title.toLowerCase().includes(query) ||
            a.subtitle?.toLowerCase().includes(query)
        );

    result.push(...matchedActions);

    // 2. Tiket & Tugas Jira
    const matchedTasks = tasks
      .filter((t) => {
        const p = projects.find((x) => x.id === t.projectId);
        const key = formatTaskKey(t.id, p?.shortName);
        return (
          t.title.toLowerCase().includes(query) ||
          key.toLowerCase().includes(query) ||
          (t.description && t.description.toLowerCase().includes(query)) ||
          t.label.toLowerCase().includes(query)
        );
      })
      .slice(0, query ? 8 : 4)
      .map((t) => {
        const p = projects.find((x) => x.id === t.projectId);
        const key = formatTaskKey(t.id, p?.shortName);
        const st = STATUS[t.status];
        return {
          id: `task-${t.id}`,
          category: 'TIKET & TUGAS (JIRA)' as const,
          title: t.title,
          subtitle: `${p?.shortName || 'Proyek'} · ${t.label}`,
          badge: key,
          badgeColor: { bg: '#EFF6FF', text: '#1D4ED8' },
          icon: <CheckSquare size={16} className="text-blue-500" />,
          onSelect: () => go(href.tugas(t.id)),
        };
      });

    result.push(...matchedTasks);

    // 3. Proyek
    const matchedProjects = projects
      .filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.shortName.toLowerCase().includes(query)
      )
      .slice(0, query ? 5 : 3)
      .map((p) => {
        const count = tasks.filter((t) => t.projectId === p.id).length;
        return {
          id: `proj-${p.id}`,
          category: 'PROYEK' as const,
          title: p.name,
          subtitle: `${p.shortName} · ${count} tugas`,
          badge: `${count} tugas`,
          badgeColor: { bg: '#F1F5F9', text: '#475569' },
          icon: <Folder size={16} className="text-amber-500" />,
          onSelect: () => go(href.proyek(p.id)),
        };
      });

    result.push(...matchedProjects);

    // 4. Klien CRM
    if (workspace.enabledModules.crm) {
      const matchedClients = clients
        .filter(
          (c) =>
            c.contact.toLowerCase().includes(query) ||
            c.company.toLowerCase().includes(query) ||
            c.email.toLowerCase().includes(query)
        )
        .slice(0, query ? 4 : 2)
        .map((c) => ({
          id: `client-${c.id}`,
          category: 'KLIEN CRM' as const,
          title: `${c.contact} (${c.company})`,
          subtitle: `${c.company} · ${c.email}`,
          badge: c.company,
          badgeColor: { bg: '#ECFDF5', text: '#047857' },
          icon: <Users size={16} className="text-emerald-500" />,
          onSelect: () => go(href.crm('klien')),
        }));

      result.push(...matchedClients);
    }

    return result;
  }, [
    isOpen,
    q,
    tasks,
    projects,
    clients,
    workspace.enabledModules.crm,
    timer,
    openCreateTask,
    setModal,
    stopTimer,
    notify,
    checkIn,
  ]);

  // Adjust selected index when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, items.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % Math.max(1, items.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIndex]) {
        items[selectedIndex].onSelect();
        setModal(null);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setModal(null);
    }
  };

  // Ensure selected item is visible
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pencarian Cepat Spotlight"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16 sm:pt-24 backdrop-blur-sm animate-in fade-in"
      onClick={() => setModal(null)}
    >
      <div
        className="flex w-full max-w-[620px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
          <Search size={20} className="text-teal-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cari tugas, kunci tiket (SINAR-01), proyek, klien, atau aksi..."
            className="flex-1 bg-transparent text-[15px] text-slate-800 placeholder-slate-400 outline-none"
          />
          <kbd className="hidden sm:inline-flex rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-500">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="max-h-[380px] overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              Tidak ada hasil yang cocok dengan &quot;<strong>{q}</strong>&quot;
            </div>
          ) : (
            (() => {
              let lastCategory = '';
              return items.map((item, idx) => {
                const showHeader = item.category !== lastCategory;
                lastCategory = item.category;
                const isSelected = idx === selectedIndex;

                return (
                  <React.Fragment key={item.id}>
                    {showHeader && (
                      <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {item.category}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        item.onSelect();
                        setModal(null);
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                        isSelected
                          ? 'bg-teal-50 text-teal-950 font-medium'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            isSelected ? 'bg-white shadow-xs' : 'bg-slate-100'
                          }`}
                        >
                          {item.icon}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="truncate leading-snug">{item.title}</span>
                          {item.subtitle && (
                            <span className="truncate text-xs text-slate-400 font-normal">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                      </div>

                      {item.badge && (
                        <span
                          className="shrink-0 rounded-md px-2 py-0.5 text-xs font-mono font-semibold"
                          style={{
                            backgroundColor: item.badgeColor?.bg || '#F1F5F9',
                            color: item.badgeColor?.text || '#475569',
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </React.Fragment>
                );
              });
            })()
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[12px] text-slate-500">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px]">
                ↑
              </kbd>
              <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px]">
                ↓
              </kbd>{' '}
              Navigasi
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px]">
                ↵
              </kbd>{' '}
              Pilih
            </span>
          </div>
          <span className="text-[11px] text-slate-400">Rampung Command Center</span>
        </div>
      </div>
    </div>
  );
};
