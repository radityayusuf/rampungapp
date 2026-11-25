import type { DealStage, ModuleKey, Plan, Priority, TaskStatus } from '../types';

export const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

export const STATUS: Record<TaskStatus, { label: string; dot: string; bg: string; fg: string; bar: string }> = {
  todo: { label: 'Ide', dot: '#9AA39C', bg: '#ECEEEA', fg: '#3D4750', bar: '#9AA39C' },
  in_progress: { label: 'Dikerjakan', dot: '#1D5FA8', bg: '#E6EFFA', fg: '#1D5FA8', bar: '#1D5FA8' },
  review: { label: 'Review', dot: '#F2B33D', bg: '#FDF3DC', fg: '#6B4A00', bar: '#F2B33D' },
  done: { label: 'Rampung', dot: '#0F9D8A', bg: '#E3F3F0', fg: '#0B5F54', bar: '#0F9D8A' },
};

export const PRIORITY: Record<Priority, { label: string; fg: string; bg: string }> = {
  high: { label: 'Tinggi', fg: '#B42318', bg: '#FDECEA' },
  medium: { label: 'Sedang', fg: '#8A5A00', bg: '#FDF3DC' },
  low: { label: 'Rendah', fg: '#5B6670', bg: '#ECEEEA' },
};

export const LABELS: Record<string, [string, string]> = {
  Desain: ['#F0EBFB', '#5B3AA8'],
  Riset: ['#E6EFFA', '#1D5FA8'],
  Marketing: ['#FDF3DC', '#6B4A00'],
  Backend: ['#E3F3F0', '#0B5F54'],
  Konten: ['#FCEBE3', '#9A3F0B'],
  Manajemen: ['#ECEEEA', '#3D4750'],
};

export const labelColors = (label: string): [string, string] => LABELS[label] ?? ['#ECEEEA', '#3D4750'];

export const DEAL_STAGES: { key: DealStage; label: string }[] = [
  { key: 'prospect', label: 'Prospek' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'negotiation', label: 'Negosiasi' },
  { key: 'won', label: 'Menang' },
];

export const TONE = {
  urgent: ['#FDF3DC', '#6B4A00'],
  calm: ['#ECEEEA', '#3D4750'],
  won: ['#E3F3F0', '#0B5F54'],
  late: ['#FDECEA', '#B42318'],
  info: ['#E6EFFA', '#1D5FA8'],
} as const;

export const MODULES: { key: ModuleKey; name: string; desc: string; minPlan: Plan }[] = [
  { key: 'timeTracking', name: 'Time Tracking', desc: 'Timer per task, timesheet, rekap jam kerja.', minPlan: 'pro' },
  { key: 'crm', name: 'CRM Klien', desc: 'Data klien, pipeline deal, portal klien untuk melihat progres.', minPlan: 'pro' },
  { key: 'finance', name: 'Keuangan Proyek', desc: 'Anggaran, pengeluaran, invoice, dan pelunasan.', minPlan: 'pro' },
  { key: 'sdm', name: 'SDM', desc: 'Absensi, cuti, dan kapasitas tim.', minPlan: 'pro' },
  { key: 'integrations', name: 'Integrasi', desc: 'Notifikasi WhatsApp, Google Calendar, Slack, API publik.', minPlan: 'bisnis' },
  { key: 'aiAssistant', name: 'Asisten AI', desc: 'Pecah ide jadi daftar task, ringkasan progres mingguan.', minPlan: 'bisnis' },
];

export const PLANS: { key: Plan; name: string; monthly: number | null; unit: string; desc: string; cta: string; items: string[]; popular?: boolean }[] = [
  { key: 'gratis', name: 'Gratis', monthly: 0, unit: 'sampai 5 anggota', desc: 'Untuk tim kecil yang baru mulai.', cta: 'Mulai gratis', items: ['Board, List, dan Kalender', '3 proyek aktif', 'Komentar dan @mention', 'Penyimpanan 1 GB'] },
  { key: 'pro', name: 'Pro', monthly: 149000, unit: 'per bulan · sampai 10 anggota', desc: 'Untuk tim yang butuh perencanaan lengkap.', cta: 'Coba Pro 14 hari', popular: true, items: ['Proyek tanpa batas', 'Timeline/Gantt dan dependensi', 'Otomasi', '1 modul bisnis pilihan'] },
  { key: 'bisnis', name: 'Bisnis', monthly: 349000, unit: 'per bulan · sampai 30 anggota', desc: 'Untuk agensi dan perusahaan yang melayani klien.', cta: 'Pilih Bisnis', items: ['Semua modul bisnis', 'Portal klien', 'Integrasi WhatsApp & otomasi', 'Invoice dan pelunasan klien'] },
  { key: 'enterprise', name: 'Enterprise', monthly: null, unit: 'harga sesuai kebutuhan', desc: 'Untuk organisasi dengan kebutuhan khusus.', cta: 'Hubungi kami', items: ['Semua fitur Bisnis', 'Harga dan kontrak khusus', 'Bantuan instalasi di server sendiri', 'Pendampingan onboarding tim'] },
];

export const PLAN_RANK: Record<Plan, number> = { gratis: 0, pro: 1, bisnis: 2, enterprise: 3 };
