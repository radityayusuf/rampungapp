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

export type Role = 'owner' | 'admin' | 'member' | 'superadmin' | 'client';
export interface ApiUser { id: number; name: string; email: string; role: Role; workspace_id: number; workspace_name: string }
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

export interface QrisGenerateResult {
  status: string;
  transactionId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  merchant: string;
  qrPayload: string;
  qrImageUrl: string;
  expiresAt: string;
  message: string;
}

export interface AiBreakdownResult {
  suggestedLabel: string;
  suggestedPriority: 'low' | 'medium' | 'high';
  totalEstimatedHours: string;
  subtasks: { title: string; estimatedMinutes: number }[];
  advice: string;
}

export interface AiSummarizeResult {
  projectName: string;
  completionRate: string;
  stats: { total: number; done: number; inProgress: number; review: number; todo: number };
  healthStatus: 'on_track' | 'at_risk' | 'delayed';
  summary: string;
  recommendation: string;
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

  // ─── Integrasi QRIS ───
  generateQris: (body: { invoiceId?: string; amount: number; customerName?: string }) =>
    call<QrisGenerateResult>('/integrations/qris/generate', { method: 'POST', body }),
  verifyQris: (body: { invoiceId: string; transactionId?: string }) =>
    call<{ status: string; invoiceId: string; paidAt: string; message: string }>('/integrations/qris/verify', { method: 'POST', body }),

  // ─── Integrasi WhatsApp ───
  sendWhatsApp: (body: { phone: string; message: string; template?: string }) =>
    call<{ status: string; messageId: string; to: string; sentAt: string; message: string }>('/integrations/whatsapp/send', { method: 'POST', body }),
  getWhatsAppStatus: () =>
    call<{ connected: boolean; phoneNumber: string; accountName: string; quotaRemaining: number }>('/integrations/whatsapp/status'),

  // ─── Asisten AI ───
  aiBreakdown: (body: { title: string; description?: string }) =>
    call<AiBreakdownResult>('/integrations/ai/breakdown', { method: 'POST', body }),
  aiSummarize: (body: { projectName: string; tasks: any[] }) =>
    call<AiSummarizeResult>('/integrations/ai/summarize', { method: 'POST', body }),
  sendWebhook: (body: { webhookUrl: string; service: 'slack' | 'discord'; title?: string; message: string }) =>
    call<{ status: string; service: string; sentAt: string; message: string }>('/integrations/webhook/send', { method: 'POST', body }),

  // ─── Administrator Sistem (Superadmin) ───
  getSystemStats: () => call<SystemStats>('/system/stats'),
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
  websocket: string;
  timestamp: string;
}

export interface SystemWorkspace {
  id: number;
  name: string;
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
