// Struktur data: Workspace → Space → Proyek → Task → Subtask

export type Priority = 'low' | 'medium' | 'high';

// Kolom board: Ide → Dikerjakan → Review → Rampung
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';

export interface User {
  id: string;
  name: string;
  shortName: string;
  initials: string;
  color: string; // warna avatar
  email: string;
  phone?: string;
  /** Jalur foto profil di server, mis. /avatars/u1-….jpg. */
  avatarUrl?: string;
  role: 'owner' | 'admin' | 'member' | 'client' | 'superadmin';
  title?: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  assigneeId?: string;
}

export interface Comment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  name: string;
  size: string;
  uploadedAt: string;
  url?: string;
}

export interface Task {
  id: string;
  /** Nomor urut tiket per proyek (kunci tiket = AWALAN-nomor). Tugas lama tanpa nomor diurutkan dari waktu pembuatan. */
  num?: number;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string;
  watcherIds: string[];
  label: string;
  startDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  isMilestone?: boolean;
  estimatedHours?: number;
  loggedSeconds: number;
  subtasks: Subtask[];
  dependencies: string[]; // id task yang harus selesai dulu
  attachments: Attachment[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Project {
  id: string;
  spaceId: string;
  name: string;
  shortName: string;
  description: string;
  clientId?: string;
  budget: number; // Rupiah
  spent: number; // Rupiah
  startDate: string;
  dueDate: string;
  status: 'active' | 'completed' | 'on_hold';
  docsContent: string;
  memberIds: string[];
  clientPortalEnabled: boolean;
  portalToken?: string;
}

export interface Space {
  id: string;
  name: string;
  description: string;
}

export type ModuleKey = 'timeTracking' | 'crm' | 'finance' | 'sdm' | 'integrations' | 'aiAssistant';

export type Plan = 'gratis' | 'pro' | 'bisnis' | 'enterprise';

export interface Workspace {
  id: string;
  name: string;
  plan: Plan;
  /** Diisi server: paket berbayar berlaku sampai (null = Gratis/tanpa batas). */
  planUntil?: string | null;
  enabledModules: Record<ModuleKey, boolean>;
  company?: CompanyProfile;
  whatsappNumber?: string;
  whatsappConnected: boolean;
  hourlyRate: number;
  storageUsedMB: number;
  storageMaxMB: number;
}

export interface TimeEntry {
  id: string;
  taskId?: string;
  taskTitle: string;
  projectId?: string;
  userId: string;
  date: string; // YYYY-MM-DD
  durationSeconds: number;
  isBillable: boolean;
  note?: string;
}

export interface Client {
  id: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  status: 'lead' | 'active' | 'past';
}

export type DealStage = 'prospect' | 'proposal' | 'negotiation' | 'won' | 'lost';

export interface Deal {
  id: string;
  clientId: string;
  need: string;
  value: number; // Rupiah
  stage: DealStage;
  nextAction: string;
  urgent: boolean;
  createdAt: string;
  closedAt?: string;
}

export interface Expense {
  id: string;
  projectId: string;
  category: 'operasional' | 'vendor' | 'software' | 'transport' | 'lainnya';
  title: string;
  amount: number;
  date: string;
}

export interface InvoiceItem {
  description: string;
  /** Jumlah × harga satuan; invoice lama hanya punya amount. */
  qty?: number;
  price?: number;
  amount: number;
}

/** Identitas penerbit invoice, diisi pemilik/admin di halaman Keuangan. */
export interface CompanyProfile {
  name: string;
  address: string;
  email: string;
  phone: string;
  npwp: string;
  bankName: string;
  bankNumber: string;
  bankHolder: string;
  /** Awalan nomor invoice, mis. INV. */
  prefix: string;
  /** Catatan kaki bawaan. */
  note: string;
}

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  projectId?: string;
  items: InvoiceItem[];
  issueDate: string;
  dueDate: string;
  status: 'unpaid' | 'paid' | 'void';
  paidAt?: string;
  voidAt?: string;
  /** PPN dalam persen. */
  taxRate?: number;
  note?: string;
  /** Nama klien saat invoice diterbitkan, agar arsip tidak berubah bila data klien diubah. */
  billTo?: { company: string; contact: string };
  /** qris = dibayar lewat Midtrans (diverifikasi server); manual = dikonfirmasi admin. */
  paymentMethod?: 'qris' | 'manual';
  paymentRef?: string;
}

export interface Attendance {
  id: string;
  userId: string;
  date: string;
  checkIn: string;
  checkOut?: string;
  status: 'hadir' | 'terlambat' | 'izin' | 'cuti';
  location?: string;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  /** Jenis & alasan hanya dikirim server untuk cuti milik sendiri, atau ke pemilik/admin. */
  type?: 'tahunan' | 'sakit' | 'khusus';
  startDate: string;
  endDate: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export type AutomationTrigger = 'status_changed' | 'task_created' | 'due_soon';
export type AutomationAction = 'notify_whatsapp' | 'notify_assignee' | 'set_priority_high' | 'notify_client';

export interface AutomationRule {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  triggerValue?: TaskStatus;
  action: AutomationAction;
  isActive: boolean;
  runCount: number;
}

export interface Activity {
  id: string;
  userId: string;
  text: string;
  taskId?: string;
  projectId?: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string; // penerima
  actorId: string;
  kind: 'mention' | 'assign' | 'due' | 'status' | 'comment';
  text: string;
  taskId?: string;
  read: boolean;
  createdAt: string;
}

export type ProjectView = 'kanban' | 'list' | 'kalender' | 'timeline' | 'tabel' | 'docs';

export type Route =
  | { page: 'landing' }
  | { page: 'login'; mode: 'masuk' | 'daftar' }
  | { page: 'beranda' }
  | { page: 'tugas-saya' }
  | { page: 'inbox' }
  | { page: 'dashboard' }
  | { page: 'proyek'; projectId: string; view: ProjectView }
  | { page: 'tugas'; taskId: string }
  | { page: 'time' }
  | { page: 'crm'; tab: 'pipeline' | 'klien' | 'portal' }
  | { page: 'keuangan' }
  | { page: 'sdm' }
  | { page: 'pengaturan' }
  | { page: 'integrasi' }
  | { page: 'gabung'; token: string }
  | { page: 'portal'; token: string }
  | { page: 'lupa' }
  | { page: 'admin'; section: AdminSection }
  | { page: 'notfound' }
  | { page: 'reset'; token: string; email: string };

/** Bagian Panel Superadmin (#/admin/:bagian). */
export type AdminSection = 'ringkasan' | 'workspace' | 'pengguna' | 'paket' | 'pembayaran' | 'pengaturan' | 'sistem';
