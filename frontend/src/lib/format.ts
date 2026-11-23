// Utilitas tanggal, uang, dan durasi berbahasa Indonesia.

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const HARI_PANJANG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export { BULAN, BULAN_PANJANG, HARI, HARI_PANJANG };

const pad = (n: number) => String(n).padStart(2, '0');

/** Tanggal lokal sebagai YYYY-MM-DD. */
export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayISO = () => toISODate(new Date());

/** Parse YYYY-MM-DD sebagai tanggal lokal (tengah malam). */
export const parseISODate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (iso: string, n: number) => {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};

/** Selisih hari b - a. */
export const diffDays = (a: string, b: string) =>
  Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 864e5);

/** Tanggal relatif terhadap hari ini (dipakai data contoh). */
export const relDay = (offset: number) => addDays(todayISO(), offset);

export const fmtDate = (iso: string) => {
  const d = parseISODate(iso);
  return `${d.getDate()} ${BULAN[d.getMonth()]}`;
};

export const fmtDateLong = (iso: string) => {
  const d = parseISODate(iso);
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
};

export const fmtDayDate = (iso: string) => {
  const d = parseISODate(iso);
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}`;
};

export const fmtFullDay = (iso: string) => {
  const d = parseISODate(iso);
  return `${HARI_PANJANG[d.getDay()]}, ${d.getDate()} ${BULAN_PANJANG[d.getMonth()]}`;
};

export const isOverdue = (dueISO: string, done = false) => !done && diffDays(todayISO(), dueISO) < 0;

/** Menghasilkan Jira/Trello issue key seperti SINAR-101 atau KASIR-042 */
export const formatTaskKey = (taskId: string, projectShortName?: string) => {
  const prefix = (projectShortName || 'RAMP')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 5)
    .toUpperCase() || 'TASK';
  const digits = taskId.replace(/\D/g, '');
  if (digits.length >= 1) {
    return `${prefix}-${digits.padStart(2, '0')}`;
  }
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) {
    hash = ((hash << 5) - hash) + taskId.charCodeAt(i);
    hash |= 0;
  }
  const num = Math.abs(hash % 900) + 10;
  return `${prefix}-${num}`;
};

/** Label tenggat: "Terlambat · 6 Nov", "Hari ini", "Besok", "9 Nov". */
export const fmtDue = (dueISO: string, done = false) => {
  const diff = diffDays(todayISO(), dueISO);
  if (!done && diff < 0) return `Terlambat · ${fmtDate(dueISO)}`;
  if (diff === 0) return 'Hari ini';
  if (diff === 1) return 'Besok';
  return fmtDate(dueISO);
};

/** Label tenggat pendek untuk daftar tenggat minggu ini. */
export const fmtDueShort = (dueISO: string) => {
  const diff = diffDays(todayISO(), dueISO);
  if (diff < 0) return 'Terlambat';
  if (diff === 0) return 'Hari ini';
  if (diff === 1) return 'Besok';
  if (diff < 7) return HARI_PANJANG[parseISODate(dueISO).getDay()];
  return fmtDate(dueISO);
};

export const rupiah = (n: number) => 'Rp' + Math.round(n).toLocaleString('id-ID');

/** Rp186 jt, Rp20,8 jt */
export const rupiahJt = (n: number) => {
  const jt = n / 1_000_000;
  const s = Number.isInteger(Math.round(jt * 10) / 10) ? String(Math.round(jt)) : (Math.round(jt * 10) / 10).toString().replace('.', ',');
  return `Rp${s} jt`;
};

/** 1 j 24 m */
export const fmtDuration = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h} j ${pad(m)} m`;
};

/** 126 j */
export const fmtHours = (sec: number) => `${Math.round(sec / 3600)} j`;

/** 01:24:10 */
export const fmtClock = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

export const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  const days = diffDays(toISODate(new Date(iso)), todayISO());
  if (days === 1) return 'Kemarin';
  if (days < 7) return `${days} hari lalu`;
  return fmtDate(toISODate(new Date(iso)));
};

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
};

export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Token acak untuk tautan publik (portal klien). Huruf/angka yang tidak membingungkan. */
export const randomToken = (len = 24) =>
  Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 57]).join('');

export const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** Ekspor data ke file CSV dengan UTF-8 BOM untuk kompatibilitas Microsoft Excel dan sistem Indonesia */
export const exportCsv = (filename: string, rows: (string | number | boolean | null | undefined)[][]) => {
  const body = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
};
