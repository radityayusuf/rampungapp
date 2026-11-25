import { useEffect, useState } from 'react';
import type { AdminSection, ProjectView, Route } from '../types';

const ADMIN_SECTIONS: AdminSection[] = ['ringkasan', 'workspace', 'pengguna', 'paket', 'pembayaran', 'pengaturan', 'sistem'];

const VIEWS: ProjectView[] = ['kanban', 'list', 'kalender', 'timeline', 'tabel', 'docs'];

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [a, b, c] = parts;
  switch (a) {
    case undefined:
    case '':
      return { page: 'landing' };
    case 'masuk':
      return { page: 'login', mode: 'masuk' };
    case 'daftar':
      return { page: 'login', mode: 'daftar' };
    case 'beranda':
      return { page: 'beranda' };
    case 'tugas-saya':
      return { page: 'tugas-saya' };
    case 'inbox':
      return { page: 'inbox' };
    case 'dashboard':
      return { page: 'dashboard' };
    case 'proyek':
      return { page: 'proyek', projectId: b ?? '', view: VIEWS.includes(c as ProjectView) ? (c as ProjectView) : 'kanban' };
    case 'tugas':
      return { page: 'tugas', taskId: b ?? '' };
    case 'time':
      return { page: 'time' };
    case 'crm':
      return { page: 'crm', tab: b === 'klien' || b === 'portal' ? b : 'pipeline' };
    case 'keuangan':
      return { page: 'keuangan' };
    case 'sdm':
      return { page: 'sdm' };
    case 'pengaturan':
      return { page: 'pengaturan' };
    case 'integrasi':
      return { page: 'integrasi' };
    case 'admin':
    case 'admin-sistem': {
      // 'admin-sistem' = alamat lama; tetap diarahkan ke panel baru.
      const legacy: Record<string, AdminSection> = { pembayaran: 'pembayaran', workspace: 'workspace', pengguna: 'pengguna', server: 'sistem', ringkasan: 'ringkasan' };
      const sec = (ADMIN_SECTIONS as string[]).includes(b ?? '') ? (b as AdminSection) : legacy[b ?? ''] ?? 'ringkasan';
      return { page: 'admin', section: sec };
    }
    case 'gabung':
      return { page: 'gabung', token: b ?? '' };
    case 'portal':
      return { page: 'portal', token: b ?? '' };
    case 'lupa':
      return { page: 'lupa' };
    case 'reset':
      return { page: 'reset', token: b ?? '', email: decodeURIComponent(c ?? '') };
    default:
      return { page: 'notfound' };
  }
}

export const href = {
  landing: '#/',
  masuk: '#/masuk',
  daftar: '#/daftar',
  beranda: '#/beranda',
  tugasSaya: '#/tugas-saya',
  inbox: '#/inbox',
  dashboard: '#/dashboard',
  proyek: (id: string, view: ProjectView = 'kanban') => `#/proyek/${id}/${view}`,
  tugas: (id: string) => `#/tugas/${id}`,
  time: '#/time',
  crm: (tab: 'pipeline' | 'klien' | 'portal' = 'pipeline') => `#/crm/${tab}`,
  keuangan: '#/keuangan',
  sdm: '#/sdm',
  pengaturan: '#/pengaturan',
  integrasi: '#/integrasi',
  admin: (section: AdminSection = 'ringkasan') => (section === 'ringkasan' ? '#/admin' : `#/admin/${section}`),
  gabung: (t: string) => `#/gabung/${t}`,
  portal: (t: string) => `#/portal/${t}`,
  lupa: '#/lupa',
};

export const go = (to: string) => {
  window.location.hash = to;
};

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
