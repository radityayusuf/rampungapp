import React, { Suspense, lazy, useEffect } from 'react';
import { AppShell } from './components/AppShell';
import { GlobalModals } from './components/Modals';
import { Toasts } from './components/ui';
// Komponen halaman punya props berbeda-beda, jadi tipe props di sini sengaja longgar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lazyPage = <K extends string>(load: () => Promise<Record<K, React.ComponentType<any>>>, key: K) =>
  lazy(() => load().then((m) => ({ default: m[key] })));

const Landing = lazyPage(() => import('./pages/Landing'), 'Landing');
const Login = lazyPage(() => import('./pages/Login'), 'Login');
const DashboardPage = lazyPage(() => import('./pages/CorePages'), 'DashboardPage');
const HomePage = lazyPage(() => import('./pages/CorePages'), 'HomePage');
const InboxPage = lazyPage(() => import('./pages/CorePages'), 'InboxPage');
const MyTasksPage = lazyPage(() => import('./pages/CorePages'), 'MyTasksPage');
const ProjectPage = lazyPage(() => import('./pages/ProjectPage'), 'ProjectPage');
const TaskPage = lazyPage(() => import('./pages/TaskPage'), 'TaskPage');
const CrmPage = lazyPage(() => import('./pages/ModulePages'), 'CrmPage');
const FinancePage = lazyPage(() => import('./pages/FinancePage'), 'FinancePage');
const SdmPage = lazyPage(() => import('./pages/ModulePages'), 'SdmPage');
const TimePage = lazyPage(() => import('./pages/ModulePages'), 'TimePage');
const SettingsPage = lazyPage(() => import('./pages/SettingsPage'), 'SettingsPage');
const IntegrationsPage = lazyPage(() => import('./pages/IntegrationsPage'), 'IntegrationsPage');
const PortalPage = lazyPage(() => import('./pages/PortalPage'), 'PortalPage');
const ForgotPage = lazyPage(() => import('./pages/PasswordPages'), 'ForgotPage');
const ResetPage = lazyPage(() => import('./pages/PasswordPages'), 'ResetPage');
const AdminConsole = lazyPage(() => import('./pages/AdminConsole'), 'AdminConsole');

const TITLES: Record<string, string> = {
  landing: 'Dari Ide Sampai Rampung', login: 'Masuk', gabung: 'Gabung ke tim', lupa: 'Lupa kata sandi', reset: 'Kata sandi baru', portal: 'Portal klien',
  beranda: 'Beranda', 'tugas-saya': 'Tugas Saya', inbox: 'Inbox', dashboard: 'Dashboard', proyek: 'Proyek', tugas: 'Tugas', time: 'Time Tracking',
  crm: 'CRM Klien', keuangan: 'Keuangan', sdm: 'SDM', pengaturan: 'Pengaturan', integrasi: 'Integrasi', admin: 'Panel Superadmin', notfound: 'Halaman tidak ditemukan',
};

const Loading: React.FC = () => <div className="flex min-h-[40vh] items-center justify-center text-sm text-arang-muted" role="status">Memuat...</div>;

const NotFound: React.FC = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
    <span className="text-5xl font-extrabold" style={{ color: '#0B7A6B' }}>404</span>
    <h1 className="m-0 text-xl font-extrabold">Halaman tidak ditemukan</h1>
    <p className="m-0 max-w-sm text-sm text-arang-muted">Alamat yang Anda buka tidak ada atau sudah dipindahkan.</p>
    <a className="btn btn-primary mt-2" href="#/beranda">Ke beranda</a>
  </div>
);

import { useApp } from './store/AppContext';
import { go, href, useRoute } from './store/router';

export const App: React.FC = () => {
  const route = useRoute();
  const { loggedIn, booting, account } = useApp();
  const isSuper = account?.is_superadmin === true;
  const isPublic = route.page === 'landing' || route.page === 'login' || route.page === 'gabung' || route.page === 'portal' || route.page === 'lupa' || route.page === 'reset';

  useEffect(() => {
    if (booting) return;
    if (!loggedIn && !isPublic) go(href.masuk);
    // Superadmin mendarat di panelnya sendiri; pengguna biasa di workspace.
    if (loggedIn && (route.page === 'login' || route.page === 'gabung')) go(isSuper ? href.admin() : href.beranda);
  }, [loggedIn, booting, isPublic, route.page, isSuper]);

  useEffect(() => {
    document.title = `${TITLES[route.page] ?? 'Rampung'} · Rampung`;
  }, [route.page]);

  if (booting) return <div className="flex min-h-screen items-center justify-center text-sm text-arang-muted" role="status">Memuat workspace...</div>;

  let body: React.ReactNode;
  switch (route.page) {
    case 'notfound': return <NotFound />;
    case 'landing': return <Suspense fallback={<Loading />}><Landing /><Toasts /></Suspense>;
    case 'login': return <Suspense fallback={<Loading />}><Login mode={route.mode} /><Toasts /></Suspense>;
    case 'gabung': return <Suspense fallback={<Loading />}><Login mode="daftar" invite={route.token} /><Toasts /></Suspense>;
    case 'portal': return <Suspense fallback={<Loading />}><PortalPage token={route.token} /></Suspense>;
    case 'lupa': return <Suspense fallback={<Loading />}><ForgotPage /></Suspense>;
    case 'reset': return <Suspense fallback={<Loading />}><ResetPage token={route.token} email={route.email} /><Toasts /></Suspense>;
    case 'admin':
      // Panel Superadmin berdiri sendiri: tidak memakai kerangka workspace.
      return loggedIn ? <Suspense fallback={<Loading />}><AdminConsole section={route.section} /><Toasts /></Suspense> : null;
    case 'beranda': body = <HomePage />; break;
    case 'tugas-saya': body = <MyTasksPage />; break;
    case 'inbox': body = <InboxPage />; break;
    case 'dashboard': body = <DashboardPage />; break;
    case 'proyek': body = <ProjectPage projectId={route.projectId} view={route.view} />; break;
    case 'tugas': body = <TaskPage taskId={route.taskId} />; break;
    case 'time': body = <TimePage />; break;
    case 'crm': body = <CrmPage tab={route.tab} />; break;
    case 'keuangan': body = <FinancePage />; break;
    case 'sdm': body = <SdmPage />; break;
    case 'pengaturan': body = <SettingsPage />; break;
    case 'integrasi': body = <IntegrationsPage />; break;
  }
  if (!loggedIn) return null;

  return (
    <>
      <AppShell route={route}><Suspense fallback={<Loading />}>{body}</Suspense></AppShell>
      <GlobalModals />
      <Toasts />
    </>
  );
};
