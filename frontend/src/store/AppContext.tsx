import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import type {
  Activity, Attendance, AutomationRule, Client, Comment, Deal, DealStage, Expense, Invoice, LeaveRequest,
  ModuleKey, Notification, Project, Space, Task, TaskStatus, TimeEntry, User, Workspace,
} from '../types';
import { getPlanCatalog } from '../lib/plans';
import { addDays, buildTaskKeys, fmtClock, nextTaskNum, relDay, todayISO, uid, errMsg } from '../lib/format';
import { TEMPLATES } from '../lib/templates';
import { PLAN_RANK, STATUS } from '../lib/meta';
import { ApiError, api, clearToken, getToken, setToken } from '../lib/api';
import type { ApiUser, Change, IntegrationStatus, PullResult } from '../lib/api';

/** Kunci penyimpanan mode lokal lama; dibersihkan saat aplikasi dimuat. */
const LEGACY_LOCAL_KEY = 'rampung_v2';

interface Data {
  workspace: Workspace;
  members: User[];
  spaces: Space[];
  projects: Project[];
  tasks: Task[];
  comments: Comment[];
  activities: Activity[];
  notifications: Notification[];
  timeEntries: TimeEntry[];
  clients: Client[];
  deals: Deal[];
  invoices: Invoice[];
  expenses: Expense[];
  attendances: Attendance[];
  leaves: LeaveRequest[];
  automations: AutomationRule[];
  loggedIn: boolean;
}

/** Keadaan sebelum masuk: kosong. Semua data berasal dari server setelah login (tidak ada data contoh). */
const initial = (): Data => ({
  workspace: {
    id: 'ws-main', name: '', plan: 'gratis', planUntil: null, hourlyRate: 0, whatsappConnected: false, whatsappNumber: '',
    storageUsedMB: 0, storageMaxMB: 0,
    enabledModules: { timeTracking: false, crm: false, finance: false, sdm: false, integrations: false, aiAssistant: false },
  },
  members: [], spaces: [], projects: [], tasks: [], comments: [], activities: [], notifications: [], timeEntries: [],
  clients: [], deals: [], invoices: [], expenses: [], attendances: [], leaves: [], automations: [],
  loggedIn: false,
});

const GUEST: User = { id: '', name: 'Tamu', shortName: 'Tamu', initials: '?', color: '#8A949B', email: '', role: 'member' };

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

const COLLECTIONS = ['workspace', 'members', 'spaces', 'projects', 'tasks', 'comments', 'activities', 'notifications', 'timeEntries', 'clients', 'deals', 'invoices', 'expenses', 'attendances', 'leaves', 'automations'] as const;

/** key "koleksi|id" -> JSON record. Dipakai untuk mendeteksi record yang berubah. */
const snapshot = (d: Data) => {
  const m = new Map<string, string>();
  for (const c of COLLECTIONS) {
    const items = (c === 'workspace' ? [d.workspace] : d[c]) as { id: string }[];
    items.forEach((i) => m.set(`${c}|${i.id}`, JSON.stringify(i)));
  }
  return m;
};

const fromCollections = (c: Record<string, unknown[]>, acc?: ApiUser | null): Data => {
  const base = acc ? emptyData(acc) : initial();
  const out = { ...base, loggedIn: true } as Record<string, unknown>;
  for (const k of COLLECTIONS) {
    if (k === 'workspace') { if (c.workspace?.[0]) out.workspace = c.workspace[0]; }
    else if (c[k]) out[k] = c[k];
  }
  return out as unknown as Data;
};

const sameSnapshot = (a: Map<string, string>, b: Map<string, string> | null) => {
  if (!b || a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
};

const PALETTE = ['#B4530B', '#0B7A6B', '#1D5FA8', '#6B46C1', '#9A3F0B', '#0F9D8A'];
const ROLE_TITLE: Record<string, string> = { superadmin: 'Superadmin (Platform)', owner: 'Pemilik', admin: 'Admin', member: 'Anggota' };

const memberFromAccount = (acc: ApiUser, idx: number): User => {
  const parts = acc.name.trim().split(/\s+/);
  return {
    id: `u${acc.id}`, name: acc.name, shortName: parts[0], initials: (parts[0][0] + (parts[1]?.[0] ?? parts[0][1] ?? '')).toUpperCase(),
    color: PALETTE[idx % PALETTE.length], email: acc.email, role: acc.role, title: ROLE_TITLE[acc.role] ?? 'Anggota',
  };
};

/** Workspace baru bersih: tidak ada data dummy/contoh */
const emptyData = (acc: ApiUser): Data => {
  const me = memberFromAccount(acc, 0);
  return {
    workspace: {
      id: 'ws-main',
      name: acc.workspace_name,
      plan: 'gratis',
      planUntil: null,
      hourlyRate: 0,
      whatsappConnected: false,
      whatsappNumber: '',
      storageUsedMB: 0,
      storageMaxMB: 1024,
      enabledModules: {
        crm: false,
        finance: false,
        timeTracking: false,
        sdm: false,
        integrations: false,
        aiAssistant: false,
      },
    },
    members: [me],
    spaces: [{ id: 'sp-1', name: 'Umum', description: 'Ruang kerja utama' }],
    projects: [],
    tasks: [],
    comments: [],
    activities: [],
    notifications: [],
    timeEntries: [],
    clients: [],
    deals: [],
    invoices: [],
    expenses: [],
    attendances: [],
    leaves: [],
    automations: [],
    loggedIn: true,
  };
};

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: 'info' | 'success' | 'wa';
}

interface ActiveTimer {
  taskId: string;
  startedAt: number;
}

interface Ctx extends Data {
  users: User[];
  me: User;
  account: ApiUser | null;
  updateMember: (id: string, patch: Partial<User>) => void;
  removeMemberRecord: (id: string) => void;
  renameMe: (name: string) => Promise<void>;
  updateMyPhone: (phone: string) => void;
  /** Status integrasi yang BENAR-BENAR aktif di server (null di mode lokal / sebelum dimuat). */
  integrations: IntegrationStatus | null;
  refreshIntegrations: () => Promise<void>;
  /** Tarik data terbaru dari server sekarang juga (mis. setelah webhook pembayaran). */
  refreshNow: () => void;
  user: (id: string) => User;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  notify: (title: string, body?: string, tone?: Toast['tone']) => void;

  // sesi
  mode: 'local' | 'server';
  booting: boolean;
  syncStatus: SyncStatus;
  loginServer: (email: string, password: string) => Promise<ApiUser>;
  loginGoogle: (params: { credential?: string; email?: string; name?: string; invite?: string }) => Promise<ApiUser>;
  registerServer: (name: string, email: string, password: string, invite?: string) => Promise<ApiUser>;
  resetPassword: (email: string, token: string, password: string) => Promise<void>;
  canManage: boolean;
  logout: () => void;

  // task
  createTask: (t: Partial<Task> & { projectId: string; title: string }) => Task;
  /** Kunci tiket berurutan, mis. RTK-12. */
  taskKey: (taskId: string) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, status: TaskStatus) => void;
  toggleSubtask: (taskId: string, subId: string) => void;
  addSubtask: (taskId: string, title: string) => void;
  deleteSubtask: (taskId: string, subId: string) => void;
  addComment: (taskId: string, content: string) => void;
  addAttachment: (taskId: string, name: string, size: number, url?: string) => void;
  deleteAttachment: (taskId: string, attachmentId: string) => void;
  uploadAttachment: (taskId: string, file: File) => Promise<void>;

  // proyek
  /** null bila ditolak (mis. batas proyek aktif paket Gratis). */
  createProject: (p: Partial<Project> & { name: string }, templateKey?: string) => Project | null;
  updateProject: (id: string, patch: Partial<Project>) => void;
  createSpace: (name: string) => string;

  // timer
  timer: ActiveTimer | null;
  timerSeconds: number;
  startTimer: (taskId: string) => void;
  stopTimer: () => void;
  addTimeEntry: (e: Omit<TimeEntry, 'id'>) => void;

  // modul & paket
  toggleModule: (k: ModuleKey) => boolean;
  updateWorkspace: (patch: Partial<Workspace>) => void;
  canUseModule: (k: ModuleKey) => boolean;

  // crm
  addClient: (c: Omit<Client, 'id'>) => Client;
  updateClient: (id: string, patch: Partial<Client>) => void;
  deleteClient: (id: string) => void;
  createDeal: (d: Omit<Deal, 'id' | 'createdAt'>, newClient?: Omit<Client, 'id'>) => void;
  moveDeal: (id: string, stage: DealStage) => void;
  deleteDeal: (id: string) => void;

  // keuangan
  createInvoice: (i: Omit<Invoice, 'id' | 'number' | 'status'>) => Invoice;
  /** Tandai lunas SECARA MANUAL (transfer/tunai). Pembayaran QRIS dilunasi oleh server lewat Midtrans, bukan lewat fungsi ini. */
  markInvoicePaid: (id: string) => void;
  addExpense: (e: Omit<Expense, 'id'>) => void;

  // sdm
  checkIn: () => void;
  checkOut: () => void;
  addLeave: (l: Omit<LeaveRequest, 'id' | 'status' | 'userId'>) => void;
  decideLeave: (id: string, ok: boolean) => void;

  // otomasi
  addAutomation: (r: Omit<AutomationRule, 'id' | 'runCount' | 'isActive'>) => void;
  toggleAutomation: (id: string) => void;
  deleteAutomation: (id: string) => void;

  // notifikasi
  markAllRead: () => void;
  markRead: (id: string) => void;

  // UI global
  createTaskOpen: { projectId?: string; status?: TaskStatus } | null;
  openCreateTask: (o?: { projectId?: string; status?: TaskStatus }) => void;
  closeCreateTask: () => void;
  modal: 'project' | 'pricing' | 'modules' | 'automation' | 'ai' | 'wa' | 'command' | null;
  setModal: (m: Ctx['modal']) => void;
}

const AppCtx = createContext<Ctx | null>(null);

export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp harus dipakai di dalam AppProvider');
  return c;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<'local' | 'server'>(() => (getToken() ? 'server' : 'local'));
  const [booting, setBooting] = useState(() => !!getToken());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const syncStatusRef = useRef<SyncStatus>('idle');
  syncStatusRef.current = syncStatus;
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const checkRef = useRef<(() => Promise<void>) | null>(null);
  const refreshNow = useCallback(() => { void checkRef.current?.(); }, []);
  const refreshIntegrations = useCallback(async () => {
    if (mode !== 'server') { setIntegrations(null); return; }
    try { setIntegrations(await api.integrationStatus()); } catch { /* biarkan status terakhir */ }
  }, [mode]);
  const [syncTick, setSyncTick] = useState(0);
  const synced = useRef<Map<string, string> | null>(null);
  const pushing = useRef(false);
  const revRef = useRef(0);
  const [account, setAccount] = useState<ApiUser | null>(null);
  const accountRef = useRef<ApiUser | null>(null);
  accountRef.current = account;
  const [data, setData] = useState<Data>(initial);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [timer, setTimer] = useState<ActiveTimer | null>(null);
  const [now, setNow] = useState(Date.now());
  const [createTaskOpen, setCreateTaskOpen] = useState<Ctx['createTaskOpen']>(null);
  const [modal, setModal] = useState<Ctx['modal']>(null);
  const toastSeq = useRef(1);

  // Data hanya hidup di server; sisa data "mode lokal" versi lama di browser dibersihkan.
  useEffect(() => {
    try { localStorage.removeItem(LEGACY_LOCAL_KEY); } catch { /* penyimpanan dinonaktifkan */ }
  }, []);

  useEffect(() => {
    if (!timer) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [timer]);

  const patch = useCallback((fn: (d: Data) => Partial<Data>) => setData((d) => ({ ...d, ...fn(d) })), []);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback((title: string, body?: string, tone: Toast['tone'] = 'info') => {
    const id = toastSeq.current++;
    setToasts((t) => [...t.slice(-3), { id, title, body, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const meId = account ? `u${account.id}` : '';
  const me: User = useMemo(() => {
    const m = data.members.find((u) => u.id === meId) ?? (account ? memberFromAccount(account, data.members.length) : GUEST);
    return account ? { ...m, role: account.role } : m;
  }, [data.members, meId, account]);
  const user = useCallback(
    (id: string): User => data.members.find((u) => u.id === id) ?? { id, name: 'Anggota lama', shortName: 'Anggota lama', initials: '?', color: '#8A949B', email: '', role: 'member' },
    [data.members],
  );
  // Pemilik/admin boleh mengelola paket, modul, otomasi, keuangan, CRM, dan persetujuan cuti (sama dengan aturan server).
  // Sama dengan server: superadmin berhak penuh di workspace-nya sendiri.
  const canManage = me.role === 'owner' || me.role === 'admin' || me.role === 'superadmin';
  const manage = () => {
    if (canManage) return true;
    notify('Hanya pemilik atau admin', 'Peran Anda (anggota) tidak bisa melakukan ini.');
    return false;
  };

  // ---------- Sinkronisasi dengan server ----------
  const applyPull = useCallback((res: PullResult, acc: ApiUser) => {
    revRef.current = res.rev;
    setAccount(acc);
    if (res.empty) {
      // Workspace baru bersih (tanpa data dummy/contoh)
      synced.current = new Map();
      setData(emptyData(acc));
    } else {
      let d = fromCollections(res.collections, acc);
      synced.current = snapshot(d);
      if (!d.members.some((m) => m.id === `u${acc.id}`)) {
        d = { ...d, members: [memberFromAccount(acc, d.members.length), ...d.members] };
      }
      setData(d);
    }
    setSyncStatus('saved');
  }, []);

  const forceLogout = useCallback((msg?: string) => {
    clearToken();
    synced.current = null;
    setMode('local');
    setAccount(null);
    setData(initial());
    if (msg) notify('Sesi berakhir', msg);
  }, [notify]);

  // Pulihkan sesi saat halaman dibuka.
  useEffect(() => {
    if (!getToken()) return;
    let alive = true;
    (async () => {
      try {
        const [{ user: u }, res] = await Promise.all([api.me(), api.pull()]);
        if (alive) applyPull(res, u);
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) forceLogout('Silakan masuk lagi.');
        else {
          setSyncStatus('error');
          notify('Server tidak terjangkau', 'Nyalakan backend lalu muat ulang halaman.');
        }
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Peringatkan sebelum menutup/memuat ulang bila masih ada perubahan yang belum sampai ke server.
  useEffect(() => {
    if (mode !== 'server') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (syncStatusRef.current === 'saving' || syncStatusRef.current === 'error') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [mode]);

  // Kirim perubahan ke server (debounce), hanya record yang berubah.
  useEffect(() => {
    if (mode !== 'server' || !synced.current || !data.loggedIn || pushing.current) return;
    // Tandai "menyimpan" SEKARANG, bukan setelah jeda debounce, agar lencana status tidak berbohong
    // dan peringatan sebelum menutup halaman bekerja selama perubahan belum sampai ke server.
    if (!sameSnapshot(snapshot(data), synced.current)) setSyncStatus((s) => (s === 'error' ? s : 'saving'));
    const h = setTimeout(async () => {
      const next = snapshot(data);
      const prev = synced.current;
      if (!prev) return;
      const changes: Change[] = [];
      next.forEach((json, key) => { if (prev.get(key) !== json) { const [c, id] = key.split('|'); changes.push({ c, id, data: JSON.parse(json) }); } });
      prev.forEach((_, key) => { if (!next.has(key)) { const [c, id] = key.split('|'); changes.push({ c, id, data: null }); } });
      if (!changes.length) { setSyncStatus('saved'); return; }
      pushing.current = true;
      setSyncStatus('saving');
      try {
        let last = { rev: revRef.current, prev: revRef.current };
        for (let i = 0; i < changes.length; i += 500) last = await api.push(changes.slice(i, i + 500));
        // Jika anggota lain menulis di antara, biarkan rev lama agar polling menarik perubahan mereka.
        if (last.prev === revRef.current) revRef.current = last.rev;
        synced.current = next;
        setSyncStatus('saved');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) forceLogout('Silakan masuk lagi.');
        else if (e instanceof ApiError && e.status === 403) {
          // Server menolak karena izin: kembalikan data ke versi server.
          notify('Perubahan dibatalkan', e.message);
          try { if (accountRef.current) applyPull(await api.pull(), accountRef.current); } catch { setSyncStatus('error'); }
        } else { setSyncStatus('error'); setTimeout(() => setSyncTick((t) => t + 1), 8000); }
      } finally {
        pushing.current = false;
        setSyncTick((t) => t + 1);
      }
    }, 700);
    return () => clearTimeout(h);
  }, [data, mode, syncTick, forceLogout, applyPull, notify]);

  // Tarik pembaruan dari anggota lain (cek revisi tiap 8 detik, tarik hanya jika berubah & tidak ada perubahan lokal tertunda).
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    if (mode !== 'server' || !data.loggedIn) return;
    const check = async () => {
      if (pushing.current || document.hidden || !accountRef.current) return;
      try {
        const { rev } = await api.rev();
        if (rev === revRef.current) return;
        if (!sameSnapshot(snapshot(dataRef.current), synced.current)) return; // ada perubahan lokal yang belum terkirim
        const res = await api.pull();
        if (pushing.current || !sameSnapshot(snapshot(dataRef.current), synced.current)) return;
        applyPull(res, accountRef.current);
        notify('Data diperbarui', 'Ada perubahan dari anggota tim.');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) forceLogout('Silakan masuk lagi.');
      }
    };
    checkRef.current = check;
    const i = setInterval(check, 8000);
    const onVis = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', onVis); checkRef.current = null; };
  }, [mode, data.loggedIn, applyPull, notify, forceLogout]);

  useEffect(() => {
    if (mode === 'server' && data.loggedIn) void refreshIntegrations();
    else setIntegrations(null);
  }, [mode, data.loggedIn, refreshIntegrations]);

  const enterServer = useCallback(async (call: () => Promise<{ token: string; user: ApiUser }>) => {
    const r = await call();
    setToken(r.token);
    setMode('server');
    try {
      applyPull(await api.pull(), r.user);
    } catch (e) {
      clearToken();
      setMode('local');
      throw e;
    }
    return r.user;
  }, [applyPull]);

  const log = (d: Data, text: string, taskId?: string, projectId?: string): Activity[] => [
    { id: uid('a'), userId: me.id, text, taskId, projectId, createdAt: new Date().toISOString() },
    ...d.activities,
  ].slice(0, 60);

  const canUseModule = useCallback(
    (k: ModuleKey) => {
      const need = k === 'integrations' || k === 'aiAssistant' ? 'bisnis' : 'pro';
      return PLAN_RANK[data.workspace.plan] >= PLAN_RANK[need];
    },
    [data.workspace.plan],
  );

  // ---------- Task ----------
  const keys = useMemo(() => buildTaskKeys(data.tasks, data.projects), [data.tasks, data.projects]);
  const taskKey = useCallback((id: string) => keys.get(id) ?? 'TGS-?', [keys]);

  const createTask: Ctx['createTask'] = (t) => {
    const nowIso = new Date().toISOString();
    const full: Task = {
      id: uid('t'), num: nextTaskNum(data.tasks, t.projectId), description: '', status: 'todo', priority: 'medium', assigneeId: me.id, watcherIds: [], label: 'Manajemen',
      startDate: todayISO(), dueDate: relDay(3), loggedSeconds: 0, subtasks: [], dependencies: [], attachments: [],
      createdBy: me.id, createdAt: nowIso, updatedAt: nowIso, ...t,
    };
    patch((d) => {
      const notifs = full.assigneeId !== me.id
        ? [{ id: uid('n'), userId: full.assigneeId, actorId: me.id, kind: 'assign' as const, text: `menugaskan kamu ke "${full.title}"`, taskId: full.id, read: false, createdAt: nowIso }, ...d.notifications]
        : d.notifications;
      return { tasks: [full, ...d.tasks], notifications: notifs, activities: log(d, `membuat tugas "${full.title}"`, full.id, full.projectId) };
    });
    notify('Tugas dibuat', `"${full.title}" ditambahkan ke proyek.`, 'success');
    return full;
  };

  const updateTask: Ctx['updateTask'] = (id, p) =>
    patch((d) => ({ tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...p, updatedAt: new Date().toISOString() } : t)) }));

  const deleteTask: Ctx['deleteTask'] = (id) => {
    patch((d) => ({ tasks: d.tasks.filter((t) => t.id !== id).map((t) => ({ ...t, dependencies: t.dependencies.filter((x) => x !== id) })) }));
    notify('Tugas dihapus');
  };

  const bumpRun = (ruleId: string) =>
    patch((d) => ({ automations: d.automations.map((a) => (a.id === ruleId ? { ...a, runCount: a.runCount + 1 } : a)) }));

  /** Menjalankan satu aturan otomasi dan melaporkan hasilnya apa adanya. runCount hanya naik jika aksinya benar-benar terjadi. */
  const runAutomation = async (r: AutomationRule, task: Task, status: TaskStatus) => {
    const project = data.projects.find((p) => p.id === task.projectId);
    const label = STATUS[status].label;
    const skip = (why: string) => notify(`Otomasi dilewati: ${r.name}`, why);

    if (r.action === 'set_priority_high') {
      patch((d) => ({ tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, priority: 'high' as const } : t)) }));
      notify(`Otomasi berjalan: ${r.name}`, `Prioritas "${task.title}" dinaikkan ke Tinggi.`);
      if (canManage) bumpRun(r.id);
      return;
    }
    if (r.action === 'notify_assignee') {
      if (task.assigneeId === me.id) return skip('Anda sendiri penanggung jawabnya, jadi tidak ada yang perlu diberi tahu.');
      notify(`Otomasi berjalan: ${r.name}`, `${user(task.assigneeId).shortName} diberi tahu lewat inbox.`);
      if (canManage) bumpRun(r.id);
      return;
    }

    // notify_whatsapp (ke penanggung jawab) dan notify_client (ke klien proyek): kirim sungguhan atau lewati dengan alasan jelas.
    if (!canManage) return skip('Pesan WhatsApp hanya dikirim bila dipicu oleh pemilik atau admin.');
    if (mode !== 'server' || !integrations?.whatsapp.configured) return skip('WhatsApp belum dikonfigurasi di server.');

    let phone: string | undefined;
    let text: string;
    if (r.action === 'notify_client') {
      const c = data.clients.find((x) => x.id === project?.clientId);
      if (!c) return skip('Proyek ini belum punya klien.');
      phone = c.phone;
      if (!phone) return skip(`Klien ${c.company} belum punya nomor telepon.`);
      text = `Halo ${c.contact || c.company}, tugas "${task.title}" pada proyek ${project?.name ?? ''} kini berstatus ${label}.`;
    } else {
      const a = user(task.assigneeId);
      phone = a.phone;
      if (!phone) return skip(`${a.shortName} belum mengisi nomor WhatsApp (Pengaturan → Profil).`);
      text = `Rampung: tugas "${task.title}"${project ? ` (${project.shortName})` : ''} kini berstatus ${label}.`;
    }
    try {
      const res = await api.sendWhatsApp({ phone, message: text });
      notify(`Otomasi berjalan: ${r.name}`, `Pesan diterima WhatsApp untuk ${res.to}.`, 'wa');
      bumpRun(r.id);
    } catch (e) {
      notify(`Otomasi gagal: ${r.name}`, errMsg(e));
    }
  };

  const moveTask: Ctx['moveTask'] = (id, status) => {
    const cur = data.tasks.find((t) => t.id === id);
    if (!cur || cur.status === status) return;
    if (status === 'done') {
      const blockers = cur.dependencies.map((id) => data.tasks.find((t) => t.id === id)).filter((t): t is Task => !!t && t.status !== 'done');
      if (blockers.length) {
        notify('Belum bisa diselesaikan', `Selesaikan dulu: ${blockers.map((b) => `"${b.title}"`).join(', ')}.`);
        return;
      }
    }
    const nowIso = new Date().toISOString();
    const rules = data.automations.filter((a) => a.isActive && a.trigger === 'status_changed' && a.triggerValue === status);
    patch((d) => ({
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, status, updatedAt: nowIso, completedAt: status === 'done' ? nowIso : undefined } : t)),
      activities: log(d, `memindahkan "${cur.title}" ke ${STATUS[status].label}`, id, cur.projectId),
      notifications: cur.assigneeId !== me.id
        ? [{ id: uid('n'), userId: cur.assigneeId, actorId: me.id, kind: 'status' as const, text: `memindahkan "${cur.title}" ke ${STATUS[status].label}`, taskId: id, read: false, createdAt: nowIso }, ...d.notifications]
        : d.notifications,
    }));
    if (status === 'done') {
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.65 }, colors: ['#0F9D8A', '#F2B33D', '#0B7A6B', '#1D5FA8'] });
      notify('Rampung!', `"${cur.title}" selesai tuntas.`, 'success');
    }
    rules.forEach((r) => { void runAutomation(r, cur, status); });
  };

  const toggleSubtask: Ctx['toggleSubtask'] = (taskId, subId) =>
    patch((d) => ({
      tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, completed: !s.completed } : s)) } : t)),
    }));

  const addSubtask: Ctx['addSubtask'] = (taskId, title) =>
    patch((d) => ({
      tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, subtasks: [...t.subtasks, { id: uid('st'), title, completed: false, assigneeId: t.assigneeId }] } : t)),
    }));

  const deleteSubtask: Ctx['deleteSubtask'] = (taskId, subId) =>
    patch((d) => ({
      tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subId) } : t)),
    }));

  const addComment: Ctx['addComment'] = (taskId, content) => {
    const t = data.tasks.find((x) => x.id === taskId);
    const nowIso = new Date().toISOString();
    const mentioned = data.members.filter((u) => u.id !== me.id && content.toLowerCase().includes('@' + u.shortName.toLowerCase()));
    patch((d) => ({
      comments: [...d.comments, { id: uid('c'), taskId, userId: me.id, content, createdAt: nowIso }],
      notifications: [
        ...mentioned.map((u) => ({ id: uid('n'), userId: u.id, actorId: me.id, kind: 'mention' as const, text: `menyebut kamu di "${t?.title}"`, taskId, read: false, createdAt: nowIso })),
        ...d.notifications,
      ],
      activities: log(d, `berkomentar di "${t?.title}"`, taskId, t?.projectId),
    }));
    mentioned.forEach((u) => notify(`${u.shortName} disebut`, 'Notifikasi dikirim ke inbox.', 'info'));
  };

  const addAttachment: Ctx['addAttachment'] = (taskId, name, size, url) =>
    patch((d) => ({
      tasks: d.tasks.map((t) =>
        t.id === taskId
          ? { ...t, attachments: [...t.attachments, { id: uid('att'), name, size: size > 1e6 ? `${(size / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(size / 1e3))} KB`, url, uploadedAt: new Date().toISOString() }] }
          : t,
      ),
    }));

  const deleteAttachment: Ctx['deleteAttachment'] = (taskId, attachmentId) =>
    patch((d) => ({
      tasks: d.tasks.map((t) =>
        t.id === taskId ? { ...t, attachments: t.attachments.filter((a) => a.id !== attachmentId) } : t
      ),
    }));

  const uploadAttachment: Ctx['uploadAttachment'] = async (taskId, file) => {
    if (mode === 'server') {
      try {
        notify('Mengunggah berkas...', file.name);
        const res = await api.uploadFile(file);
        addAttachment(taskId, file.name, file.size, res.url);
        notify('Berkas terunggah', file.name, 'success');
        return;
      } catch (err) {
        notify('Gagal mengunggah', errMsg(err, 'Gagal menyimpan ke server'));
      }
    }
    addAttachment(taskId, file.name, file.size);
  };

  // ---------- Proyek ----------
  const createProject: Ctx['createProject'] = (p, templateKey) => {
    // Sama dengan batas di server (diatur Superadmin); server tetap menjadi penentu akhir.
    const maxProjects = getPlanCatalog().plans.find((x) => x.key === data.workspace.plan)?.limits.activeProjects ?? null;
    if (maxProjects !== null && data.projects.filter((x) => x.status !== 'completed').length >= maxProjects) {
      notify('Batas paket tercapai', `Paket Anda maksimal ${maxProjects} proyek aktif. Selesaikan proyek lain atau tingkatkan paket.`);
      setModal('pricing');
      return null;
    }
    // Proyek selalu punya space yang benar-benar ada; bila workspace belum punya space, dibuatkan "Umum".
    // Ditentukan di dalam patch agar space yang baru dibuat pada klik yang sama ikut terhitung.
    const defaultSpace = { id: uid('sp'), name: 'Umum', description: 'Ruang kerja utama' };
    const full: Project = {
      id: uid('p'), shortName: p.name, description: '', budget: 0, spent: 0,
      startDate: todayISO(), dueDate: relDay(30), status: 'active', docsContent: `# ${p.name}\n\nCatatan dan dokumentasi proyek.`,
      memberIds: [me.id], clientPortalEnabled: false, ...p,
      spaceId: p.spaceId || '',
    };
    const tpl = TEMPLATES.find((x) => x.key === templateKey);
    const nowIso = new Date().toISOString();
    const fromTemplate: Task[] = (tpl?.tasks ?? []).map((t) => ({
      id: uid('t'), projectId: full.id, title: t.title, description: '', status: 'todo', priority: t.priority, assigneeId: me.id, watcherIds: [], label: t.label,
      startDate: addDays(full.startDate, t.startDay), dueDate: addDays(full.startDate, t.endDay), isMilestone: t.milestone, loggedSeconds: 0,
      subtasks: (t.subtasks ?? []).map((title) => ({ id: uid('st'), title, completed: false, assigneeId: me.id })),
      dependencies: [], attachments: [], createdBy: me.id, createdAt: nowIso, updatedAt: nowIso,
    }));
    // Rantai dependensi sederhana: tiap tugas non-milestone menunggu tugas sebelumnya yang berakhir lebih dulu.
    fromTemplate.forEach((t, i) => { if (i > 0 && !t.isMilestone) t.dependencies = [fromTemplate[i - 1].id]; });
    patch((d) => {
      const spaceId = d.spaces.some((x) => x.id === full.spaceId) ? full.spaceId : d.spaces[0]?.id ?? defaultSpace.id;
      return { spaces: d.spaces.length ? d.spaces : [defaultSpace], projects: [...d.projects, { ...full, spaceId }], tasks: [...fromTemplate, ...d.tasks], activities: log(d, `membuat proyek "${full.name}"`, undefined, full.id) };
    });
    notify('Proyek dibuat', `"${full.name}" siap dikerjakan.`, 'success');
    return full;
  };

  const updateProject: Ctx['updateProject'] = (id, p) => patch((d) => ({ projects: d.projects.map((x) => (x.id === id ? { ...x, ...p } : x)) }));

  const createSpace: Ctx['createSpace'] = (name) => {
    const id = uid('sp');
    patch((d) => ({ spaces: [...d.spaces, { id, name, description: '' }] }));
    notify('Space ditambahkan', name, 'success');
    return id;
  };

  // ---------- Timer ----------
  const timerSeconds = timer ? Math.max(0, Math.floor((now - timer.startedAt) / 1000)) : 0;

  const addTimeEntry: Ctx['addTimeEntry'] = (e) => patch((d) => ({ timeEntries: [{ ...e, id: uid('te') }, ...d.timeEntries] }));

  const stopTimer = () => {
    if (!timer) return;
    const secs = Math.floor((Date.now() - timer.startedAt) / 1000);
    const t = data.tasks.find((x) => x.id === timer.taskId);
    setTimer(null);
    if (secs >= 5 && t) {
      patch((d) => ({
        timeEntries: [{ id: uid('te'), taskId: t.id, taskTitle: t.title, projectId: t.projectId, userId: me.id, date: todayISO(), durationSeconds: secs, isBillable: true }, ...d.timeEntries],
        tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, loggedSeconds: x.loggedSeconds + secs } : x)),
      }));
      notify('Timer disimpan', `${fmtClock(secs)} dicatat ke timesheet.`, 'success');
    } else {
      notify('Timer dihentikan', 'Kurang dari 5 detik, tidak dicatat.');
    }
  };

  const startTimer = (taskId: string) => {
    if (timer) stopTimer();
    setTimer({ taskId, startedAt: Date.now() });
    const t = data.tasks.find((x) => x.id === taskId);
    notify('Timer berjalan', t?.title);
  };

  // ---------- Modul ----------
  const toggleModule: Ctx['toggleModule'] = (k) => {
    if (!manage()) return false;
    if (!canUseModule(k)) {
      notify('Perlu paket lebih tinggi', k === 'integrations' || k === 'aiAssistant' ? 'Modul ini tersedia di paket Bisnis.' : 'Modul bisnis tersedia mulai paket Pro.');
      setModal('pricing');
      return false;
    }
    const on = !data.workspace.enabledModules[k];
    if (on && data.workspace.plan === 'pro') {
      const active = Object.entries(data.workspace.enabledModules).filter(([key, v]) => v && key !== k).length;
      if (active >= 1) {
        notify('Paket Pro: 1 modul bisnis', 'Matikan modul lain atau upgrade ke Bisnis.');
        setModal('pricing');
        return false;
      }
    }
    patch((d) => ({ workspace: { ...d.workspace, enabledModules: { ...d.workspace.enabledModules, [k]: on } } }));
    notify(on ? 'Modul diaktifkan' : 'Modul dimatikan', undefined, 'success');
    return true;
  };


  const updateWorkspace: Ctx['updateWorkspace'] = (p) => manage() && patch((d) => ({ workspace: { ...d.workspace, ...p } }));

  // ---------- CRM ----------
  const addClient: Ctx['addClient'] = (c) => {
    const full: Client = { ...c, id: uid('cl') };
    patch((d) => ({ clients: [...d.clients, full] }));
    notify('Klien ditambahkan', full.company, 'success');
    return full;
  };

  const updateClient: Ctx['updateClient'] = (id, p) => {
    patch((d) => ({ clients: d.clients.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
    notify('Klien diperbarui', undefined, 'success');
  };

  const deleteClient: Ctx['deleteClient'] = (id) => {
    patch((d) => ({
      clients: d.clients.filter((c) => c.id !== id),
      deals: d.deals.filter((x) => x.clientId !== id),
    }));
    notify('Klien dihapus', undefined, 'info');
  };

  const createDeal: Ctx['createDeal'] = (deal, newClient) => {
    const clientId = newClient ? uid('cl') : deal.clientId;
    patch((d) => ({
      clients: newClient ? [...d.clients, { ...newClient, id: clientId }] : d.clients,
      deals: [...d.deals, { ...deal, clientId, id: uid('d'), createdAt: new Date().toISOString() }],
    }));
    notify('Deal ditambahkan', deal.need, 'success');
  };

  const moveDeal: Ctx['moveDeal'] = (id, stage) => {
    patch((d) => ({ deals: d.deals.map((x) => (x.id === id ? { ...x, stage, closedAt: stage === 'won' || stage === 'lost' ? new Date().toISOString() : undefined, nextAction: stage === 'won' ? 'Proyek berjalan' : x.nextAction } : x)) }));
    if (stage === 'won') {
      confetti({ particleCount: 80, spread: 70 });
      notify('Deal menang!', undefined, 'success');
    }
  };

  const deleteDeal: Ctx['deleteDeal'] = (id) => {
    patch((d) => ({ deals: d.deals.filter((x) => x.id !== id) }));
    notify('Deal dihapus', undefined, 'info');
  };

  // ---------- Keuangan ----------
  const createInvoice: Ctx['createInvoice'] = (i) => {
    const n = data.invoices.length + 10 + 1;
    const full: Invoice = { ...i, id: uid('inv'), number: `INV-2026-${String(n).padStart(3, '0')}`, status: 'unpaid' };
    patch((d) => ({ invoices: [full, ...d.invoices] }));
    notify('Invoice dibuat', full.number, 'success');
    return full;
  };

  const markInvoicePaid: Ctx['markInvoicePaid'] = (id) => {
    if (!manage()) return;
    const inv = data.invoices.find((x) => x.id === id);
    if (!inv || inv.status === 'paid') return;
    patch((d) => ({ invoices: d.invoices.map((x) => (x.id === id ? { ...x, status: 'paid', paidAt: new Date().toISOString(), paymentMethod: 'manual' } : x)) }));
    notify('Invoice ditandai lunas', `${inv.number} dikonfirmasi manual.`, 'success');
  };

  const addExpense: Ctx['addExpense'] = (e) => {
    if (!manage()) return;
    patch((d) => ({
      expenses: [{ ...e, id: uid('ex') }, ...d.expenses],
      projects: d.projects.map((p) => (p.id === e.projectId ? { ...p, spent: p.spent + e.amount } : p)),
    }));
    notify('Pengeluaran dicatat', undefined, 'success');
  };

  // ---------- SDM ----------
  const checkIn = () => {
    if (data.attendances.some((a) => a.userId === me.id && a.date === todayISO())) return notify('Sudah check-in hari ini');
    const hm = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
    const late = new Date().getHours() * 60 + new Date().getMinutes() > 9 * 60 + 15;
    patch((d) => ({ attendances: [{ id: uid('att'), userId: me.id, date: todayISO(), checkIn: hm, status: late ? 'terlambat' : 'hadir', location: 'Kantor Studio Nusa' }, ...d.attendances] }));
    notify('Check-in berhasil', hm, 'success');
  };

  const checkOut = () => {
    const hm = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
    patch((d) => ({ attendances: d.attendances.map((a) => (a.userId === me.id && a.date === todayISO() ? { ...a, checkOut: hm } : a)) }));
    notify('Check-out berhasil', hm, 'success');
  };

  const addLeave: Ctx['addLeave'] = (l) => {
    patch((d) => ({ leaves: [{ ...l, id: uid('lv'), userId: me.id, status: 'pending' }, ...d.leaves] }));
    notify('Pengajuan cuti terkirim', undefined, 'success');
  };

  const decideLeave: Ctx['decideLeave'] = (id, ok) => {
    if (!manage()) return;
    patch((d) => ({ leaves: d.leaves.map((l) => (l.id === id ? { ...l, status: ok ? 'approved' : 'rejected' } : l)) }));
    notify(ok ? 'Cuti disetujui' : 'Cuti ditolak');
  };

  // ---------- Otomasi ----------
  const addAutomation: Ctx['addAutomation'] = (r) => {
    if (!manage()) return;
    patch((d) => ({ automations: [...d.automations, { ...r, id: uid('au'), runCount: 0, isActive: true }] }));
    notify('Aturan otomasi disimpan', r.name, 'success');
  };
  const toggleAutomation: Ctx['toggleAutomation'] = (id) => manage() && patch((d) => ({ automations: d.automations.map((a) => (a.id === id ? { ...a, isActive: !a.isActive } : a)) }));
  const deleteAutomation: Ctx['deleteAutomation'] = (id) => manage() && patch((d) => ({ automations: d.automations.filter((a) => a.id !== id) }));

  // ---------- Notifikasi ----------
  const markAllRead = () => patch((d) => ({ notifications: d.notifications.map((n) => (n.userId === me.id ? { ...n, read: true } : n)) }));
  const markRead = (id: string) => patch((d) => ({ notifications: d.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));

  const value: Ctx = {
    ...data,
    users: data.members, me, account, user, toasts, dismissToast, notify,
    mode, booting, syncStatus,
    loginServer: (email, password) => enterServer(() => api.login(email, password)),
    loginGoogle: (params) => enterServer(() => api.loginGoogle(params)),
    resetPassword: async (email, token, password) => { await enterServer(() => api.reset(email, token, password)); },
    canManage,
    registerServer: (name, email, password, invite) => enterServer(() => api.register(name, email, password, invite)),
    updateMember: (id, p) => patch((d) => ({ members: d.members.map((m) => (m.id === id ? { ...m, ...p } : m)) })),
    removeMemberRecord: (id) => patch((d) => ({ members: d.members.filter((m) => m.id !== id) })),
    updateMyPhone: (phone) => {
      const clean = phone.trim();
      if (clean && !/^[0-9+\-\s()]{8,20}$/.test(clean)) { notify('Nomor tidak valid', 'Gunakan angka, mis. 0812 3456 7890.'); return; }
      patch((d) => ({ members: d.members.map((m) => (m.id === meId ? { ...m, phone: clean || undefined } : m)) }));
      notify(clean ? 'Nomor WhatsApp disimpan' : 'Nomor WhatsApp dihapus', undefined, 'success');
    },
    integrations, refreshIntegrations, refreshNow,
    renameMe: async (name) => {
      const clean = name.trim();
      if (!clean) return;
      if (mode === 'server') { const r = await api.updateMe(clean); setAccount(r.user); }
      const parts = clean.split(/\s+/);
      patch((d) => ({ members: d.members.map((m) => (m.id === meId ? { ...m, name: clean, shortName: parts[0], initials: (parts[0][0] + (parts[1]?.[0] ?? parts[0][1] ?? '')).toUpperCase() } : m)) }));
      notify('Nama diperbarui', undefined, 'success');
    },
    logout: () => {
      if (mode === 'server') {
        api.logout().catch(() => undefined);
        clearToken();
        synced.current = null;
        setMode('local');
        setData(initial());
      } else patch(() => ({ loggedIn: false }));
    },
    createTask, taskKey, updateTask, deleteTask, moveTask, toggleSubtask, addSubtask, deleteSubtask, addComment, addAttachment, deleteAttachment, uploadAttachment,
    createProject, updateProject, createSpace,
    timer, timerSeconds, startTimer, stopTimer, addTimeEntry,
    toggleModule, updateWorkspace, canUseModule,
    addClient, updateClient, deleteClient, createDeal, moveDeal, deleteDeal, createInvoice, markInvoicePaid, addExpense,
    checkIn, checkOut, addLeave, decideLeave,
    addAutomation, toggleAutomation, deleteAutomation, markAllRead, markRead,
    createTaskOpen,
    openCreateTask: (o) => setCreateTaskOpen(o ?? {}),
    closeCreateTask: () => setCreateTaskOpen(null),
    modal, setModal,
  };

  // Semua nilai yang dibaca konsumen lewat konteks harus ada di daftar ini, kalau tidak komponen tidak melihat perubahannya.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memo = useMemo(() => value, [data, toasts, timer, now, createTaskOpen, modal, account, integrations, syncStatus, mode, booting]);
  return <AppCtx.Provider value={memo}>{children}</AppCtx.Provider>;
};
