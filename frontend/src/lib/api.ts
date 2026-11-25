// Klien API Rampung (Node.js & Laravel). Token disimpan di localStorage.
const BASE: string = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api';
const TOKEN_KEY = 'rampung_token';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* abaikan */ } };
export const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* abaikan */ } };

async function call<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const token = init.auth === false ? null : getToken();
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: init.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('Server tidak terjangkau. Pastikan backend berjalan.', 0);
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 429) throw new ApiError('Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.', 429);
  if (!res.ok) {
    const first = json?.errors ? (Object.values(json.errors)[0] as string[])[0] : undefined;
    throw new ApiError(first ?? json?.message ?? `Permintaan gagal (${res.status}).`, res.status);
  }
  return json as T;
}

/** Kirim multipart (unggah berkas) dengan penanganan galat yang sama seperti call(). */
async function callForm<T>(path: string, form: FormData, method = 'POST'): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: form });
  } catch {
    throw new ApiError('Server tidak terjangkau. Pastikan backend berjalan.', 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json?.message ?? `Permintaan gagal (${res.status}).`, res.status);
  return json as T;
}

/** Ambil berkas yang butuh login (bukti transfer, laporan) sebagai Blob. */
async function fetchBlob(path: string): Promise<Blob> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError('Server tidak terjangkau. Pastikan backend berjalan.', 0);
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new ApiError(j?.message ?? `Permintaan gagal (${res.status}).`, res.status);
  }
  return res.blob();
}

/** Simpan Blob sebagai unduhan, atau buka di tab baru bila `open`. */
export function saveBlob(blob: Blob, filename: string, open = false) {
  const url = URL.createObjectURL(blob);
  if (open) {
    window.open(url, '_blank', 'noopener');
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type Role = 'owner' | 'admin' | 'member' | 'superadmin' | 'client';
export interface ApiUser { id: number; name: string; email: string; role: Role; workspace_id: number; workspace_name: string; is_superadmin?: boolean }
export interface Change { c: string; id: string; data: unknown | null }
export interface PullResult { empty: boolean; rev: number; collections: Record<string, unknown[]> }
export interface ApiMember { id: number; name: string; email: string; role: Role }
export interface ApiInvite { id: number; email: string; role: Role; token: string; created_at: string }
export interface ApiToken { id: number; name: string; created_at: string; last_used_at: string | null }
export interface PortalData {
  workspace: string; client: string | null;
  project: { name: string; description: string; startDate: string | null; dueDate: string | null };
  tasks: { title: string; status: string; dueDate: string | null; assignee: string | null; subtasks: number; subtasksDone: number }[];
}

export interface UploadResult {
  id: number;
  name: string;
  storedName: string;
  size: number;
  mimeType: string;
  url: string;
  uploadedAt: string;
}

export type PaymentStatus = 'pending' | 'submitted' | 'paid' | 'rejected' | 'expired';
export interface PlanPurchaseMeta {
  plan: 'pro' | 'bisnis'; period: 'monthly' | 'yearly'; seats: number; months: number; pricePerUserMonth: number;
  transfer?: { method?: 'qris' | 'bank'; senderName?: string; note?: string };
}
/** Satu tagihan paket. Nominal = harga paket + kode unik; semuanya dihitung server. */
export interface PlanPayment {
  orderId: string;
  status: PaymentStatus;
  amount: number;
  baseAmount: number;
  uniqueCode: number;
  expiresAt: string | null;
  createdAt: string | null;
  submittedAt: string | null;
  paidAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  hasProof: boolean;
  proofName: string | null;
  meta: PlanPurchaseMeta;
}
export interface BankAccount { id: string; bank: string; number: string; holder: string }
/** Tujuan pembayaran yang diatur superadmin. */
export interface PaymentInfo { qrisImage: string | null; qrisName: string; accounts: BankAccount[]; instructions: string }

/** Paket, harga, pemakaian, tujuan pembayaran, dan riwayat tagihan (semua dari server). */
export interface BillingInfo {
  plan: 'gratis' | 'pro' | 'bisnis' | 'enterprise';
  planUntil: string | null;
  expired: boolean;
  trialAvailable: boolean;
  trialDays: number;
  seats: number;
  prices: { pro: number; bisnis: number };
  periods: Record<'monthly' | 'yearly', { months: number; charged: number }>;
  limits: { members: number | null; activeProjects: number | null; storageBytes: number | null };
  usage: { members: number; activeProjects: number; storageBytes: number };
  paymentsConfigured: boolean;
  paymentInfo: PaymentInfo;
  paymentTtlHours: number;
  canPurchase: boolean;
  pending: PlanPayment | null;
  history: PlanPayment[];
}

/** Katalog paket (publik) dan konfigurasi yang dapat diubah Superadmin. */
export interface PlanLimits { members: number | null; activeProjects: number | null; storageGb: number | null }
export interface PlanCatalogEntry { key: 'gratis' | 'pro' | 'bisnis' | 'enterprise'; name: string; monthly: number | null; desc: string; items: string[]; popular: boolean; limits: PlanLimits }
export interface PlanCatalog { yearlyChargedMonths: number; trialDays: number; plans: PlanCatalogEntry[] }
export interface PlanConfig {
  prices: { pro: number; bisnis: number };
  yearlyChargedMonths: number;
  trialDays: number;
  proBusinessModules: number;
  limits: Record<'gratis' | 'pro' | 'bisnis', PlanLimits>;
  catalog: Record<'gratis' | 'pro' | 'bisnis' | 'enterprise', { desc: string; items: string[] }>;
}

/** Pengaturan tujuan pembayaran (panel superadmin). */
export interface PaymentSettings extends PaymentInfo { uniqueCode: boolean; configured: boolean }
export interface AdminPayment {
  id: number; orderId: string; workspaceId: number; workspaceName: string; buyerName: string; buyerEmail: string;
  plan: string; period: string; seats: number; months: number; baseAmount: number; uniqueCode: number; amount: number;
  status: PaymentStatus; statusLabel: string; method: string; senderName: string; buyerNote: string;
  hasProof: boolean; proofName: string | null;
  createdAt: string | null; submittedAt: string | null; reviewedAt: string | null; paidAt: string | null;
  reviewerName: string; reviewNote: string;
}
export interface AdminPaymentList {
  items: AdminPayment[]; total: number; page: number; pageSize: number; awaitingReviewAll: number;
  summary: { total: number; paidCount: number; paidAmount: number; awaitingReview: number; pending: number; rejected: number; expired: number };
}
export interface PaymentFilter { status?: string; q?: string; from?: string; to?: string; basis?: 'created' | 'paid'; page?: number; pageSize?: number }
const qs = (f: PaymentFilter, extra: Record<string, string> = {}) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v !== undefined && v !== '') u.set(k, String(v));
  const t = u.toString();
  return t ? `?${t}` : '';
};

/** Apa yang BENAR-BENAR aktif di server (bukan klaim UI). */
export interface IntegrationStatus {
  payments: { configured: boolean; method: 'manual' };
  whatsapp: { configured: boolean; reachable: boolean | null; phoneNumber: string | null; accountName: string | null };
  ai: { configured: boolean; model: string | null };
  webhook: { services: string[] };
  email: { configured: boolean };
  google: { configured: boolean };
  storage: { usedBytes: number; files: number };
}

export interface AiBreakdownResult {
  suggestedLabel: string;
  suggestedPriority: 'low' | 'medium' | 'high';
  totalEstimatedHours: string;
  subtasks: { title: string; estimatedMinutes: number }[];
  advice: string;
  /** ai = dihasilkan model AI; template = saran berbasis kata kunci (bukan AI). */
  source: 'ai' | 'template';
  model?: string;
}

export interface AiSummarizeResult {
  projectName: string;
  completionRate: string;
  stats: { total: number; done: number; inProgress: number; review: number; todo: number; overdue: number };
  healthStatus: 'on_track' | 'at_risk' | 'delayed';
  summary: string;
  recommendation: string;
  source: 'analisis';
}

export const api = {
  login: (email: string, password: string) => call<{ token: string; user: ApiUser }>('/auth/login', { method: 'POST', body: { email, password } }),
  loginGoogle: (params: { credential?: string; email?: string; name?: string; invite?: string }) => call<{ token: string; user: ApiUser }>('/auth/google', { method: 'POST', body: params, auth: false }),
  register: (name: string, email: string, password: string, invite?: string) => call<{ token: string; user: ApiUser }>('/auth/register', { method: 'POST', body: { name, email, password, invite } }),
  forgot: (email: string) => call<{ message: string }>('/auth/forgot', { method: 'POST', body: { email }, auth: false }),
  reset: (email: string, token: string, password: string) => call<{ token: string; user: ApiUser }>('/auth/reset', { method: 'POST', body: { email, token, password }, auth: false }),
  me: () => call<{ user: ApiUser }>('/auth/me'),
  updateMe: (name: string) => call<{ user: ApiUser }>('/auth/me', { method: 'PATCH', body: { name } }),
  logout: () => call<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  pull: () => call<PullResult>('/sync'),
  rev: () => call<{ rev: number }>('/sync/rev'),
  push: (changes: Change[]) => call<{ ok: boolean; rev: number; prev: number }>('/sync', { method: 'POST', body: { changes } }),

  members: () => call<{ members: ApiMember[] }>('/members'),
  setRole: (id: number, role: 'admin' | 'member') => call<{ ok: boolean }>(`/members/${id}`, { method: 'PATCH', body: { role } }),
  removeMember: (id: number) => call<{ ok: boolean }>(`/members/${id}`, { method: 'DELETE' }),
  invites: () => call<{ invites: ApiInvite[] }>('/invites'),
  invite: (email: string, role: 'admin' | 'member') => call<{ token: string; email: string; role: Role; emailed: boolean }>('/invites', { method: 'POST', body: { email, role } }),
  revokeInvite: (id: number) => call<{ ok: boolean }>(`/invites/${id}`, { method: 'DELETE' }),
  inviteInfo: (token: string) => call<{ email: string; role: Role; workspace_name: string }>(`/invites/${encodeURIComponent(token)}`, { auth: false }),

  tokens: () => call<{ tokens: ApiToken[] }>('/tokens'),
  createToken: (name: string) => call<{ token: string }>('/tokens', { method: 'POST', body: { name } }),
  deleteToken: (id: number) => call<{ ok: boolean }>(`/tokens/${id}`, { method: 'DELETE' }),

  portal: (token: string) => call<PortalData>(`/portal/${encodeURIComponent(token)}`, { auth: false }),

  // ─── Upload Berkas ───
  uploadFile: async (file: File): Promise<UploadResult> => {
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(BASE + '/upload', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err?.message || 'Gagal mengunggah file.', res.status);
    }
    return res.json();
  },

  // ─── Paket & penagihan ───
  billing: () => call<BillingInfo>('/billing'),
  checkoutPlan: (plan: 'pro' | 'bisnis', period: 'monthly' | 'yearly') => call<PlanPayment>('/billing/checkout', { method: 'POST', body: { plan, period } }),
  planPayment: (orderId: string) => call<PlanPayment>(`/billing/payments/${encodeURIComponent(orderId)}`),
  submitProof: (orderId: string, file: File, extra: { method?: 'qris' | 'bank'; senderName?: string; note?: string }) => {
    const f = new FormData();
    if (extra.method) f.set('method', extra.method);
    if (extra.senderName) f.set('senderName', extra.senderName);
    if (extra.note) f.set('note', extra.note);
    f.set('proof', file);
    return callForm<PlanPayment>(`/billing/payments/${encodeURIComponent(orderId)}/proof`, f);
  },
  ownProof: (orderId: string) => fetchBlob(`/billing/payments/${encodeURIComponent(orderId)}/proof`),
  cancelPayment: (orderId: string) => call<{ ok: boolean }>(`/billing/payments/${encodeURIComponent(orderId)}/cancel`, { method: 'POST' }),
  startTrial: () => call<{ plan: string; planUntil: string; trial: boolean }>('/billing/trial', { method: 'POST' }),

  // ─── Integrasi ───
  integrationStatus: () => call<IntegrationStatus>('/integrations/status'),

  sendWhatsApp: (body: { phone: string; message: string }) =>
    call<{ status: 'accepted'; messageId: string; to: string; sentAt: string; message: string }>('/integrations/whatsapp/send', { method: 'POST', body }),

  aiBreakdown: (body: { title: string; description?: string }) =>
    call<AiBreakdownResult>('/integrations/ai/breakdown', { method: 'POST', body }),
  aiSummarize: (body: { projectId: string }) =>
    call<AiSummarizeResult>('/integrations/ai/summarize', { method: 'POST', body }),
  sendWebhook: (body: { webhookUrl: string; service: 'slack' | 'discord'; title?: string; message: string }) =>
    call<{ status: string; service: string; sentAt: string; message: string }>('/integrations/webhook/send', { method: 'POST', body }),

  // ─── Administrator Sistem (Superadmin) ───
  getSystemStats: () => call<SystemStats>('/system/stats'),
  setWorkspacePlan: (id: number, plan: string, until: string | null) => call<{ id: number; plan: string; planUntil: string | null }>(`/system/workspaces/${id}/plan`, { method: 'PATCH', body: { plan, until } }),
  plans: () => call<PlanCatalog>('/plans', { auth: false }),
  adminPlans: () => call<{ config: PlanConfig; defaults: PlanConfig }>('/system/plans'),
  saveAdminPlans: (config: PlanConfig) => call<{ config: PlanConfig }>('/system/plans', { method: 'PUT', body: config }),
  // Pembayaran paket (superadmin)
  paymentSettings: () => call<PaymentSettings>('/system/payment-settings'),
  savePaymentSettings: (b: { accounts: Omit<BankAccount, 'id'>[]; qrisName: string; instructions: string; uniqueCode: boolean }) =>
    call<PaymentSettings>('/system/payment-settings', { method: 'PUT', body: b }),
  uploadQris: (file: File) => { const f = new FormData(); f.set('qris', file); return callForm<PaymentSettings>('/system/payment-settings/qris', f, 'PUT'); },
  deleteQris: () => call<PaymentSettings>('/system/payment-settings/qris', { method: 'DELETE' }),
  adminPayments: (f: PaymentFilter) => call<AdminPaymentList>(`/system/payments${qs(f)}`),
  adminProof: (id: number) => fetchBlob(`/system/payments/${id}/proof`),
  approvePayment: (id: number, note?: string) => call<{ ok: boolean; item: AdminPayment }>(`/system/payments/${id}/approve`, { method: 'POST', body: { note } }),
  rejectPayment: (id: number, note: string) => call<{ ok: boolean; item: AdminPayment }>(`/system/payments/${id}/reject`, { method: 'POST', body: { note } }),
  exportPayments: (f: PaymentFilter, format: 'csv' | 'xlsx') => fetchBlob(`/system/payments/export${qs({ ...f, page: undefined, pageSize: undefined }, { format })}`),
  getSystemWorkspaces: () => call<{ workspaces: SystemWorkspace[] }>('/system/workspaces'),
  getSystemUsers: () => call<{ users: SystemUser[] }>('/system/users'),
  deleteSystemUser: (id: number) => call<{ message: string }>(`/system/users/${id}`, { method: 'DELETE' }),
  updateSystemUserRole: (id: number, role: string) => call<{ message: string; role: string }>(`/system/users/${id}/role`, { method: 'PATCH', body: { role } }),
};

export interface SystemStats {
  totalUsers: number;
  totalWorkspaces: number;
  totalRecords: number;
  totalUploads: number;
  storageBytes: number;
  serverUptimeSeconds: number;
  nodeVersion: string;
  memoryUsageMB: number;
  database: string;
  dbLatencyMs: number;
  websocket: string;
  timestamp: string;
}

export interface SystemWorkspace {
  id: number;
  name: string;
  plan: 'gratis' | 'pro' | 'bisnis' | 'enterprise';
  planUntil: string | null;
  ownerName: string;
  ownerEmail: string;
  memberCount: number;
  recordCount: number;
  createdAt: string;
}

export interface SystemUser {
  id: number;
  name: string;
  email: string;
  role: string;
  workspaceId: number;
  workspaceName: string;
  createdAt: string;
}

export const API_BASE = BASE;
