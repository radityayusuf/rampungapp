// Data contoh workspace "Studio Nusa", diambil dari mockup UI Rampung.
// Semua tanggal relatif terhadap hari ini supaya status (Besok, Terlambat, dst.) tetap masuk akal.
import type {
  Activity, Attendance, AutomationRule, Client, Comment, Deal, Expense, Invoice,
  LeaveRequest, Notification, Project, Space, Subtask, Task, TimeEntry, User, Workspace,
} from '../types';
import { relDay } from '../lib/format';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const at = (offset: number, hour = 9) => `${relDay(offset)}T${String(hour).padStart(2, '0')}:00:00`;

export const CURRENT_USER_ID = 'usr-rina';

export const seedUsers: User[] = [
  { id: 'usr-rina', name: 'Rina Saraswati', shortName: 'Rina', initials: 'RS', color: '#B4530B', email: 'rina@studionusa.id', phone: '0812-1111-2201', role: 'owner', title: 'Project Manager' },
  { id: 'usr-dimas', name: 'Dimas Aditya', shortName: 'Dimas', initials: 'DA', color: '#0B7A6B', email: 'dimas@studionusa.id', phone: '0812-1111-2202', role: 'admin', title: 'UI/UX Designer' },
  { id: 'usr-bayu', name: 'Bayu Wicaksono', shortName: 'Bayu', initials: 'BW', color: '#1D5FA8', email: 'bayu@studionusa.id', phone: '0812-1111-2203', role: 'member', title: 'Backend Developer' },
  { id: 'usr-nadia', name: 'Nadia Putri', shortName: 'Nadia', initials: 'NP', color: '#6B46C1', email: 'nadia@studionusa.id', phone: '0812-1111-2204', role: 'member', title: 'Content Writer' },
];

export const seedWorkspace: Workspace = {
  id: 'ws-studio-nusa',
  name: 'Studio Nusa',
  plan: 'bisnis',
  enabledModules: { timeTracking: true, crm: true, finance: true, sdm: false, integrations: true, aiAssistant: true },
  whatsappConnected: false,
  hourlyRate: 0,
  storageUsedMB: 412,
  storageMaxMB: 51200,
};

export const seedSpaces: Space[] = [
  { id: 'sp-web', name: 'Website Klien', description: 'Proyek website dan aplikasi untuk klien' },
  { id: 'sp-sosmed', name: 'Konten Sosmed', description: 'Konten media sosial dan branding' },
  { id: 'sp-ops', name: 'Operasional', description: 'Pekerjaan internal studio' },
];

const TEAM = ['usr-rina', 'usr-dimas', 'usr-bayu', 'usr-nadia'];

export const seedProjects: Project[] = [
  {
    id: 'p-sinar', spaceId: 'sp-web', name: 'Peluncuran Website PT Sinar Jaya', shortName: 'Website PT Sinar Jaya',
    description: 'Website perusahaan PT Sinar Jaya: profil, layanan, testimoni, dan pembayaran QRIS.',
    clientId: 'cl-sinar', budget: 32_000_000, spent: 14_200_000, startDate: relDay(-6), dueDate: relDay(23),
    status: 'active', memberIds: TEAM, clientPortalEnabled: true,
    docsContent: '# Peluncuran Website PT Sinar Jaya\n\n## Tujuan\nWebsite perusahaan yang menampilkan profil, layanan, dan testimoni klien, serta menerima pembayaran lewat QRIS.\n\n## Kontak klien\nBu Rina (PT Sinar Jaya)\n\n## Catatan rapat kickoff\n- Hero memakai foto tim, bukan ilustrasi.\n- Review desain setiap Jumat.\n- Target peluncuran akhir bulan.',
  },
  {
    id: 'p-konten', spaceId: 'sp-sosmed', name: 'Konten Instagram November', shortName: 'Konten Instagram November',
    description: 'Jadwal dan produksi konten Instagram bulan November.', budget: 9_000_000, spent: 6_100_000,
    startDate: relDay(-10), dueDate: relDay(21), status: 'active', memberIds: ['usr-nadia', 'usr-dimas', 'usr-rina'], clientPortalEnabled: false,
    docsContent: '# Konten Instagram November\n\nTema bulan ini: cerita di balik layar Studio Nusa.',
  },
  {
    id: 'p-kasir', spaceId: 'sp-web', name: 'Aplikasi Kasir Kopi Senja', shortName: 'Aplikasi Kasir Kopi Senja',
    description: 'Aplikasi kasir tahap 2 untuk Kopi Senja.', clientId: 'cl-kopi', budget: 20_000_000, spent: 15_400_000,
    startDate: relDay(-20), dueDate: relDay(38), status: 'active', memberIds: ['usr-bayu', 'usr-dimas', 'usr-rina'], clientPortalEnabled: false,
    docsContent: '# Aplikasi Kasir Kopi Senja\n\nTahap 2: menu dinamis, stok bahan, dan cetak struk.',
  },
  {
    id: 'p-batik', spaceId: 'sp-sosmed', name: 'Rebranding Batik Laras', shortName: 'Rebranding Batik Laras',
    description: 'Rebranding dan katalog online Batik Laras.', clientId: 'cl-batik', budget: 16_000_000, spent: 2_100_000,
    startDate: relDay(-4), dueDate: relDay(43), status: 'active', memberIds: ['usr-dimas', 'usr-nadia', 'usr-rina'], clientPortalEnabled: false,
    docsContent: '# Rebranding Batik Laras\n\nLogo baru, palet warna, dan katalog online.',
  },
  {
    id: 'p-ops', spaceId: 'sp-ops', name: 'Laporan Operasional Q4', shortName: 'Laporan Operasional Q4',
    description: 'Rekap operasional studio kuartal 4.', budget: 0, spent: 0,
    startDate: relDay(-30), dueDate: relDay(54), status: 'active', memberIds: ['usr-rina', 'usr-bayu'], clientPortalEnabled: false,
    docsContent: '# Laporan Operasional Q4\n\nRekap keuangan, kehadiran, dan kapasitas tim.',
  },
];

let subSeq = 0;
const subs = (titles: string[], done: number, who: string | string[]): Subtask[] =>
  titles.map((title, i) => ({
    id: `st-${++subSeq}`,
    title,
    completed: i < done,
    assigneeId: Array.isArray(who) ? who[i] : who,
  }));

type TaskInput = Omit<Task, 'watcherIds' | 'dependencies' | 'attachments' | 'createdBy' | 'createdAt' | 'updatedAt' | 'loggedSeconds' | 'description'> &
  Partial<Pick<Task, 'watcherIds' | 'dependencies' | 'attachments' | 'loggedSeconds' | 'description' | 'completedAt'>>;

const task = (t: TaskInput): Task => ({
  description: '',
  watcherIds: [],
  dependencies: [],
  attachments: [],
  loggedSeconds: 0,
  createdBy: 'usr-rina',
  createdAt: at(-8),
  updatedAt: at(-1),
  ...t,
});

export const seedTasks: Task[] = [
  // Ide
  task({ id: 't-riset', projectId: 'p-sinar', title: 'Riset referensi desain kompetitor', status: 'todo', priority: 'low', assigneeId: 'usr-dimas', label: 'Desain', startDate: relDay(2), dueDate: relDay(5),
    subtasks: subs(['Kumpulkan 10 website pesaing', 'Catat pola hero dan navigasi', 'Rangkum temuan untuk tim'], 0, 'usr-dimas') }),
  task({ id: 't-kebutuhan', projectId: 'p-sinar', title: 'Daftar kebutuhan halaman klien', status: 'todo', priority: 'medium', assigneeId: 'usr-rina', label: 'Riset', startDate: relDay(-2), dueDate: relDay(0),
    subtasks: subs(['Wawancara tim marketing klien', 'Daftar halaman wajib', 'Daftar fitur tambahan', 'Konfirmasi ke klien'], 1, 'usr-rina') }),
  task({ id: 't-kampanye', projectId: 'p-sinar', title: 'Ide kampanye peluncuran', status: 'todo', priority: 'low', assigneeId: 'usr-nadia', label: 'Marketing', startDate: relDay(7), dueDate: relDay(13),
    subtasks: subs(['Brainstorm tema kampanye', 'Draf jadwal posting peluncuran'], 0, 'usr-nadia') }),
  // Dikerjakan
  task({ id: 't-beranda', projectId: 'p-sinar', title: 'Desain halaman beranda', status: 'in_progress', priority: 'high', assigneeId: 'usr-dimas', label: 'Desain', startDate: relDay(-3), dueDate: relDay(1),
    description: 'Buat desain beranda versi desktop dan mobile sesuai brief klien. Fokus pada hero, daftar layanan, dan testimoni. Gunakan logo dan palet warna yang sedang direview.',
    estimatedHours: 6, loggedSeconds: 4 * 3600 + 10 * 60, watcherIds: ['usr-rina', 'usr-nadia'], dependencies: ['t-logo'],
    attachments: [
      { id: 'att-1', name: 'beranda-desktop.fig', size: '4,2 MB', uploadedAt: hoursAgo(1) },
      { id: 'att-2', name: 'beranda-mobile.png', size: '860 KB', uploadedAt: hoursAgo(1) },
    ],
    subtasks: subs(['Wireframe struktur halaman', 'Hero dengan foto tim', 'Bagian daftar layanan', 'Bagian testimoni klien', 'Versi mobile'], 3,
      ['usr-dimas', 'usr-dimas', 'usr-dimas', 'usr-nadia', 'usr-dimas']) }),
  task({ id: 't-laravel', projectId: 'p-sinar', title: 'Setup Laravel dan autentikasi', status: 'in_progress', priority: 'high', assigneeId: 'usr-bayu', label: 'Backend', startDate: relDay(-3), dueDate: relDay(3), estimatedHours: 10,
    loggedSeconds: 7 * 3600, subtasks: subs(['Inisialisasi proyek Laravel', 'Migrasi tabel pengguna', 'Login dan reset sandi', 'Peran admin dan editor'], 2, 'usr-bayu') }),
  task({ id: 't-copy', projectId: 'p-sinar', title: 'Copywriting halaman Tentang Kami', status: 'in_progress', priority: 'medium', assigneeId: 'usr-nadia', label: 'Konten', startDate: relDay(-1), dueDate: relDay(4),
    watcherIds: ['usr-rina'], subtasks: subs(['Draf sejarah perusahaan', 'Profil tim manajemen'], 1, 'usr-nadia') }),
  // Review
  task({ id: 't-qris', projectId: 'p-sinar', title: 'Integrasi pembayaran QRIS', status: 'review', priority: 'high', assigneeId: 'usr-bayu', label: 'Backend', startDate: relDay(-5), dueDate: relDay(-1), estimatedHours: 12,
    loggedSeconds: 10 * 3600, subtasks: subs(['Daftar akun sandbox Midtrans', 'Buat QRIS dinamis', 'Webhook status pembayaran', 'Uji transaksi'], 4, 'usr-bayu') }),
  task({ id: 't-logo', projectId: 'p-sinar', title: 'Logo dan palet warna klien', status: 'review', priority: 'medium', assigneeId: 'usr-dimas', label: 'Desain', startDate: relDay(-4), dueDate: relDay(1),
    loggedSeconds: 6 * 3600, subtasks: subs(['Tiga alternatif logo', 'Palet warna utama', 'Panduan pemakaian'], 3, 'usr-dimas') }),
  // Rampung
  task({ id: 't-kickoff', projectId: 'p-sinar', title: 'Kickoff meeting dengan klien', status: 'done', priority: 'medium', assigneeId: 'usr-rina', label: 'Manajemen', startDate: relDay(-6), dueDate: relDay(-6),
    completedAt: at(-6, 15), subtasks: subs(['Siapkan agenda', 'Kirim notulen'], 2, 'usr-rina') }),
  task({ id: 't-kontrak', projectId: 'p-sinar', title: 'Kontrak dan timeline proyek', status: 'done', priority: 'high', assigneeId: 'usr-rina', label: 'Manajemen', startDate: relDay(-5), dueDate: relDay(-4),
    completedAt: hoursAgo(26), subtasks: subs(['Draf kontrak', 'Timeline per minggu', 'Tanda tangan klien'], 3, 'usr-rina') }),
  // Rencana berikutnya (tampil di Timeline)
  task({ id: 't-dev', projectId: 'p-sinar', title: 'Pengembangan halaman', status: 'todo', priority: 'medium', assigneeId: 'usr-bayu', label: 'Backend', startDate: relDay(7), dueDate: relDay(19),
    dependencies: ['t-beranda', 't-laravel'], subtasks: subs(['Beranda', 'Layanan', 'Tentang Kami', 'Kontak dan pembayaran'], 0, 'usr-bayu') }),
  task({ id: 't-qa', projectId: 'p-sinar', title: 'QA dan revisi klien', status: 'todo', priority: 'medium', assigneeId: 'usr-rina', label: 'Manajemen', startDate: relDay(17), dueDate: relDay(21),
    dependencies: ['t-dev'], subtasks: subs(['Uji di HP dan desktop', 'Kumpulkan revisi klien', 'Perbaiki revisi'], 0, 'usr-rina') }),
  task({ id: 't-launch', projectId: 'p-sinar', title: 'Peluncuran website', status: 'todo', priority: 'high', assigneeId: 'usr-rina', label: 'Manajemen', startDate: relDay(23), dueDate: relDay(23), isMilestone: true,
    dependencies: ['t-qa'], subtasks: [] }),

  // Konten Instagram November
  task({ id: 't-posting3', projectId: 'p-konten', title: 'Jadwal posting minggu 3', status: 'in_progress', priority: 'medium', assigneeId: 'usr-nadia', label: 'Konten', startDate: relDay(-2), dueDate: relDay(4),
    loggedSeconds: 2 * 3600 + 45 * 60, subtasks: subs(['Tentukan 5 topik', 'Tulis caption', 'Jadwalkan di Meta Suite'], 2, 'usr-nadia') }),
  task({ id: 't-feed12', projectId: 'p-konten', title: 'Desain feed minggu 1 dan 2', status: 'done', priority: 'medium', assigneeId: 'usr-dimas', label: 'Desain', startDate: relDay(-10), dueDate: relDay(-5),
    completedAt: at(-5, 16), subtasks: subs(['Template feed', '10 desain feed'], 2, 'usr-dimas') }),
  task({ id: 't-caption2', projectId: 'p-konten', title: 'Caption dan hashtag minggu 2', status: 'done', priority: 'low', assigneeId: 'usr-nadia', label: 'Konten', startDate: relDay(-7), dueDate: relDay(-3),
    completedAt: at(-3, 11), subtasks: subs(['Caption', 'Riset hashtag'], 2, 'usr-nadia') }),
  task({ id: 't-insight', projectId: 'p-konten', title: 'Laporan insight Oktober', status: 'done', priority: 'medium', assigneeId: 'usr-rina', label: 'Riset', startDate: relDay(-9), dueDate: relDay(0),
    completedAt: at(0, 8), subtasks: subs(['Unduh data insight', 'Rangkum ke slide'], 2, 'usr-rina') }),
  task({ id: 't-story', projectId: 'p-konten', title: 'Desain story promo akhir bulan', status: 'review', priority: 'medium', assigneeId: 'usr-dimas', label: 'Desain', startDate: relDay(-2), dueDate: relDay(2),
    subtasks: subs(['Konsep visual', 'Story 1-3', 'Story 4-6', 'Revisi'], 3, 'usr-dimas') }),

  // Aplikasi Kasir Kopi Senja
  task({ id: 't-wireframe-kasir', projectId: 'p-kasir', title: 'Wireframe menu kasir', status: 'in_progress', priority: 'medium', assigneeId: 'usr-dimas', label: 'Desain', startDate: relDay(-1), dueDate: relDay(6),
    subtasks: subs(['Alur pesanan', 'Layar pembayaran', 'Layar laporan harian'], 1, 'usr-dimas') }),
  task({ id: 't-db-kasir', projectId: 'p-kasir', title: 'Database menu dan stok bahan', status: 'in_progress', priority: 'high', assigneeId: 'usr-bayu', label: 'Backend', startDate: relDay(-4), dueDate: relDay(5),
    subtasks: subs(['Skema menu', 'Skema stok bahan', 'Resep per menu', 'API stok'], 2, 'usr-bayu') }),
  task({ id: 't-printer', projectId: 'p-kasir', title: 'Integrasi printer struk', status: 'todo', priority: 'medium', assigneeId: 'usr-bayu', label: 'Backend', startDate: relDay(8), dueDate: relDay(15),
    subtasks: subs(['Uji printer thermal', 'Template struk'], 0, 'usr-bayu') }),
  task({ id: 't-kickoff-kasir', projectId: 'p-kasir', title: 'Kickoff tahap 2 dengan Kopi Senja', status: 'done', priority: 'medium', assigneeId: 'usr-rina', label: 'Manajemen', startDate: relDay(-20), dueDate: relDay(-20),
    completedAt: at(-20, 14), subtasks: [] }),

  // Rebranding Batik Laras
  task({ id: 't-moodboard', projectId: 'p-batik', title: 'Moodboard rebranding', status: 'in_progress', priority: 'medium', assigneeId: 'usr-dimas', label: 'Desain', startDate: relDay(-2), dueDate: relDay(8),
    subtasks: subs(['Kumpulkan referensi motif', 'Susun moodboard', 'Presentasi ke klien'], 1, 'usr-dimas') }),
  task({ id: 't-foto', projectId: 'p-batik', title: 'Foto produk untuk katalog', status: 'todo', priority: 'low', assigneeId: 'usr-nadia', label: 'Konten', startDate: relDay(10), dueDate: relDay(20),
    subtasks: subs(['Daftar produk', 'Sewa studio', 'Sesi foto'], 0, 'usr-nadia') }),
  task({ id: 't-riset-batik', projectId: 'p-batik', title: 'Riset pasar batik online', status: 'todo', priority: 'low', assigneeId: 'usr-rina', label: 'Riset', startDate: relDay(3), dueDate: relDay(12),
    subtasks: subs(['Survei pembeli', 'Analisis harga'], 0, 'usr-rina') }),

  // Laporan Operasional Q4
  task({ id: 't-rekap-okt', projectId: 'p-ops', title: 'Rekap pengeluaran Oktober', status: 'done', priority: 'medium', assigneeId: 'usr-rina', label: 'Manajemen', startDate: relDay(-15), dueDate: relDay(-10),
    completedAt: at(-11, 15), subtasks: subs(['Kumpulkan nota', 'Input ke spreadsheet'], 2, 'usr-rina') }),
  task({ id: 't-rapat', projectId: 'p-ops', title: 'Rapat internal mingguan', status: 'todo', priority: 'low', assigneeId: 'usr-rina', label: 'Manajemen', startDate: relDay(0), dueDate: relDay(0),
    subtasks: [] }),
  task({ id: 't-tagih-batik', projectId: 'p-batik', title: 'Tagih DP Batik Laras', status: 'in_progress', priority: 'high', assigneeId: 'usr-rina', label: 'Manajemen', startDate: relDay(-4), dueDate: relDay(-2),
    subtasks: subs(['Kirim pengingat', 'Konfirmasi pembayaran'], 1, 'usr-rina') }),
  task({ id: 't-notulen', projectId: 'p-ops', title: 'Susun notulen rapat mingguan', status: 'todo', priority: 'medium', assigneeId: 'usr-rina', label: 'Manajemen', startDate: relDay(0), dueDate: relDay(0),
    subtasks: [] }),
  task({ id: 't-server', projectId: 'p-ops', title: 'Perpanjang server dan domain', status: 'in_progress', priority: 'medium', assigneeId: 'usr-bayu', label: 'Backend', startDate: relDay(-1), dueDate: relDay(9),
    subtasks: subs(['Cek tagihan VPS', 'Perpanjang domain'], 1, 'usr-bayu') }),
];

export const seedComments: Comment[] = [
  { id: 'c-1', taskId: 't-beranda', userId: 'usr-rina', content: '@Dimas klien minta hero pakai foto tim, bukan ilustrasi. Bisa disesuaikan sebelum review Jumat?', createdAt: hoursAgo(2) },
  { id: 'c-2', taskId: 't-beranda', userId: 'usr-dimas', content: 'Siap, versi baru saya unggah besok pagi.', createdAt: hoursAgo(1) },
  { id: 'c-3', taskId: 't-copy', userId: 'usr-nadia', content: '@Rina draf sejarah perusahaan sudah saya taruh di lampiran, tolong dicek ya.', createdAt: hoursAgo(1.1) },
  { id: 'c-4', taskId: 't-qris', userId: 'usr-bayu', content: 'Webhook sudah jalan di sandbox. Tinggal review kode.', createdAt: hoursAgo(0.2) },
];

export const seedActivities: Activity[] = [
  { id: 'a-1', userId: 'usr-bayu', text: 'memindahkan "Integrasi pembayaran QRIS" ke Review', taskId: 't-qris', projectId: 'p-sinar', createdAt: hoursAgo(10 / 60) },
  { id: 'a-2', userId: 'usr-dimas', text: 'mengunggah 2 file ke "Desain halaman beranda"', taskId: 't-beranda', projectId: 'p-sinar', createdAt: hoursAgo(42 / 60) },
  { id: 'a-3', userId: 'usr-nadia', text: 'menyebut @Rina di "Copywriting halaman Tentang Kami"', taskId: 't-copy', projectId: 'p-sinar', createdAt: hoursAgo(1.1) },
  { id: 'a-4', userId: 'usr-rina', text: 'menyelesaikan "Kontrak dan timeline proyek"', taskId: 't-kontrak', projectId: 'p-sinar', createdAt: hoursAgo(26) },
  { id: 'a-5', userId: 'usr-bayu', text: 'menambahkan dependensi di "Desain halaman beranda"', taskId: 't-beranda', projectId: 'p-sinar', createdAt: hoursAgo(28) },
  { id: 'a-6', userId: 'usr-dimas', text: 'mengubah status "Desain halaman beranda" ke Dikerjakan', taskId: 't-beranda', projectId: 'p-sinar', createdAt: at(-3, 10) },
  { id: 'a-7', userId: 'usr-rina', text: 'membuat tugas "Desain halaman beranda"', taskId: 't-beranda', projectId: 'p-sinar', createdAt: at(-5, 9) },
];

export const seedNotifications: Notification[] = [
  { id: 'n-1', userId: 'usr-rina', actorId: 'usr-bayu', kind: 'status', text: 'memindahkan "Integrasi pembayaran QRIS" ke Review', taskId: 't-qris', read: false, createdAt: hoursAgo(10 / 60) },
  { id: 'n-2', userId: 'usr-rina', actorId: 'usr-nadia', kind: 'mention', text: 'menyebut kamu di "Copywriting halaman Tentang Kami"', taskId: 't-copy', read: false, createdAt: hoursAgo(1.1) },
  { id: 'n-3', userId: 'usr-rina', actorId: 'usr-dimas', kind: 'comment', text: 'membalas di "Desain halaman beranda": Siap, versi baru saya unggah besok pagi.', taskId: 't-beranda', read: false, createdAt: hoursAgo(1) },
  { id: 'n-4', userId: 'usr-rina', actorId: 'usr-bayu', kind: 'due', text: '"Integrasi pembayaran QRIS" lewat tenggat', taskId: 't-qris', read: false, createdAt: hoursAgo(9) },
  { id: 'n-5', userId: 'usr-rina', actorId: 'usr-dimas', kind: 'assign', text: 'menugaskan kamu ke "Daftar kebutuhan halaman klien"', taskId: 't-kebutuhan', read: true, createdAt: hoursAgo(30) },
];

export const seedTimeEntries: TimeEntry[] = [
  { id: 'te-1', taskId: 't-beranda', taskTitle: 'Desain halaman beranda', projectId: 'p-sinar', userId: 'usr-dimas', date: relDay(0), durationSeconds: 1 * 3600 + 24 * 60, isBillable: true },
  { id: 'te-2', taskId: 't-qris', taskTitle: 'Integrasi pembayaran QRIS', projectId: 'p-sinar', userId: 'usr-bayu', date: relDay(-1), durationSeconds: 3 * 3600 + 10 * 60, isBillable: true },
  { id: 'te-3', taskId: 't-rapat', taskTitle: 'Rapat internal mingguan', projectId: 'p-ops', userId: 'usr-rina', date: relDay(-1), durationSeconds: 3600, isBillable: false },
  { id: 'te-4', taskId: 't-posting3', taskTitle: 'Jadwal posting minggu 3', projectId: 'p-konten', userId: 'usr-nadia', date: relDay(-2), durationSeconds: 2 * 3600 + 45 * 60, isBillable: true },
  { id: 'te-5', taskId: 't-laravel', taskTitle: 'Setup Laravel dan autentikasi', projectId: 'p-sinar', userId: 'usr-bayu', date: relDay(-2), durationSeconds: 4 * 3600, isBillable: true },
  { id: 'te-6', taskId: 't-logo', taskTitle: 'Logo dan palet warna klien', projectId: 'p-sinar', userId: 'usr-dimas', date: relDay(-3), durationSeconds: 3 * 3600 + 30 * 60, isBillable: true },
  { id: 'te-7', taskId: 't-db-kasir', taskTitle: 'Database menu dan stok bahan', projectId: 'p-kasir', userId: 'usr-bayu', date: relDay(-3), durationSeconds: 2 * 3600, isBillable: true },
  { id: 'te-8', taskId: 't-beranda', taskTitle: 'Desain halaman beranda', projectId: 'p-sinar', userId: 'usr-dimas', date: relDay(-4), durationSeconds: 2 * 3600 + 46 * 60, isBillable: true },
  { id: 'te-9', taskId: 't-qris', taskTitle: 'Integrasi pembayaran QRIS', projectId: 'p-sinar', userId: 'usr-bayu', date: relDay(-4), durationSeconds: 4 * 3600, isBillable: true },
  { id: 'te-10', taskId: 't-copy', taskTitle: 'Copywriting halaman Tentang Kami', projectId: 'p-sinar', userId: 'usr-nadia', date: relDay(-5), durationSeconds: 2 * 3600, isBillable: true },
  { id: 'te-11', taskId: 't-laravel', taskTitle: 'Setup Laravel dan autentikasi', projectId: 'p-sinar', userId: 'usr-bayu', date: relDay(-5), durationSeconds: 3 * 3600, isBillable: true },
  { id: 'te-12', taskId: 't-logo', taskTitle: 'Logo dan palet warna klien', projectId: 'p-sinar', userId: 'usr-dimas', date: relDay(-6), durationSeconds: 2 * 3600 + 30 * 60, isBillable: true },
  { id: 'te-13', taskId: 't-kickoff', taskTitle: 'Kickoff meeting dengan klien', projectId: 'p-sinar', userId: 'usr-rina', date: relDay(-6), durationSeconds: 1 * 3600 + 35 * 60, isBillable: false },
];

export const seedClients: Client[] = [
  { id: 'cl-sinar', company: 'PT Sinar Jaya', contact: 'Bu Rina', email: 'rina@sinarjaya.co.id', phone: '0811-2000-101', status: 'active' },
  { id: 'cl-batik', company: 'Batik Laras', contact: 'Mbak Laras', email: 'halo@batiklaras.id', phone: '0811-2000-102', status: 'active' },
  { id: 'cl-kopi', company: 'Kopi Senja', contact: 'Mas Arif', email: 'arif@kopisenja.id', phone: '0811-2000-103', status: 'active' },
  { id: 'cl-pena', company: 'Toko Buku Pena', contact: 'Pak Bima', email: 'bima@tokobukupena.id', phone: '0811-2000-104', status: 'active' },
  { id: 'cl-puri', company: 'Hotel Puri Asri', contact: 'Mas Yoga', email: 'yoga@puriasri.id', phone: '0811-2000-105', status: 'lead' },
  { id: 'cl-medika', company: 'Klinik Sehat Medika', contact: 'dr. Anita', email: 'anita@sehatmedika.id', phone: '0811-2000-106', status: 'lead' },
  { id: 'cl-mentari', company: 'Toko Roti Mentari', contact: 'Pak Hendra', email: 'hendra@rotimentari.id', phone: '0811-2000-107', status: 'lead' },
  { id: 'cl-koperasi', company: 'Koperasi Maju Bersama', contact: 'Bu Sri', email: 'sri@majubersama.id', phone: '0811-2000-108', status: 'lead' },
  { id: 'cl-tani', company: 'CV Tani Makmur', contact: 'Pak Darto', email: 'darto@tanimakmur.id', phone: '0811-2000-109', status: 'lead' },
  { id: 'cl-bina', company: 'Sekolah Bina Insani', contact: 'Bu Lestari', email: 'lestari@binainsani.sch.id', phone: '0811-2000-110', status: 'lead' },
  { id: 'cl-arunika', company: 'Arunika Travel', contact: 'Mas Dewa', email: 'dewa@arunika.id', phone: '0811-2000-111', status: 'past' },
];

export const seedDeals: Deal[] = [
  { id: 'd-1', clientId: 'cl-medika', need: 'Website profil dan booking dokter', value: 35_000_000, stage: 'prospect', nextAction: 'Telepon hari ini', urgent: true, createdAt: at(-3) },
  { id: 'd-2', clientId: 'cl-mentari', need: 'Konten Instagram 3 bulan', value: 18_000_000, stage: 'prospect', nextAction: 'Kirim katalog', urgent: false, createdAt: at(-5) },
  { id: 'd-3', clientId: 'cl-koperasi', need: 'Aplikasi simpan pinjam', value: 60_000_000, stage: 'prospect', nextAction: 'Jadwalkan demo', urgent: false, createdAt: at(-6) },
  { id: 'd-4', clientId: 'cl-puri', need: 'Redesain website dan SEO', value: 28_000_000, stage: 'proposal', nextAction: 'Follow up email', urgent: true, createdAt: at(-12) },
  { id: 'd-5', clientId: 'cl-tani', need: 'Sistem stok gudang', value: 22_000_000, stage: 'proposal', nextAction: 'Menunggu respon', urgent: false, createdAt: at(-14) },
  { id: 'd-6', clientId: 'cl-bina', need: 'Portal akademik', value: 15_000_000, stage: 'negotiation', nextAction: 'Revisi harga', urgent: true, createdAt: at(-20) },
  { id: 'd-7', clientId: 'cl-kopi', need: 'Aplikasi kasir tahap 2', value: 8_000_000, stage: 'negotiation', nextAction: 'Kirim kontrak', urgent: false, createdAt: at(-18) },
  { id: 'd-8', clientId: 'cl-sinar', need: 'Website perusahaan', value: 32_000_000, stage: 'won', nextAction: 'Proyek berjalan', urgent: false, createdAt: at(-30), closedAt: at(-7) },
  { id: 'd-9', clientId: 'cl-batik', need: 'Rebranding dan katalog online', value: 16_000_000, stage: 'won', nextAction: 'Proyek berjalan', urgent: false, createdAt: at(-25), closedAt: at(-5) },
  { id: 'd-10', clientId: 'cl-arunika', need: 'Aplikasi pemesanan tur', value: 40_000_000, stage: 'lost', nextAction: 'Ditutup', urgent: false, createdAt: at(-70), closedAt: at(-40) },
  { id: 'd-11', clientId: 'cl-pena', need: 'Toko online buku', value: 12_000_000, stage: 'lost', nextAction: 'Ditutup', urgent: false, createdAt: at(-60), closedAt: at(-33) },
  { id: 'd-12', clientId: 'cl-puri', need: 'Sistem reservasi kamar', value: 25_000_000, stage: 'lost', nextAction: 'Ditutup', urgent: false, createdAt: at(-80), closedAt: at(-50) },
];

export const seedInvoices: Invoice[] = [
  { id: 'inv-14', number: 'INV-2026-014', clientId: 'cl-sinar', projectId: 'p-sinar', items: [{ description: 'Termin 1 (50%) · Website perusahaan', amount: 16_000_000 }], issueDate: relDay(-7), dueDate: relDay(7), status: 'unpaid' },
  { id: 'inv-13', number: 'INV-2026-013', clientId: 'cl-batik', projectId: 'p-batik', items: [{ description: 'DP 30% rebranding', amount: 4_800_000 }], issueDate: relDay(-16), dueDate: relDay(-2), status: 'unpaid' },
  { id: 'inv-12', number: 'INV-2026-012', clientId: 'cl-kopi', projectId: 'p-kasir', items: [{ description: 'Aplikasi kasir tahap 1', amount: 6_500_000 }], issueDate: relDay(-22), dueDate: relDay(-8), status: 'paid', paidAt: at(-9) },
  { id: 'inv-11', number: 'INV-2026-011', clientId: 'cl-pena', items: [{ description: 'Maintenance Oktober', amount: 1_500_000 }], issueDate: relDay(-27), dueDate: relDay(-13), status: 'paid', paidAt: at(-14) },
  { id: 'inv-10', number: 'INV-2026-010', clientId: 'cl-puri', items: [{ description: 'Audit SEO', amount: 3_000_000 }], issueDate: relDay(-32), dueDate: relDay(-18), status: 'paid', paidAt: at(-19) },
];

export const seedExpenses: Expense[] = [
  { id: 'ex-1', projectId: 'p-sinar', category: 'software', title: 'Lisensi font dan foto stok', amount: 1_200_000, date: relDay(-4) },
  { id: 'ex-2', projectId: 'p-kasir', category: 'vendor', title: 'Printer thermal untuk uji coba', amount: 1_850_000, date: relDay(-6) },
  { id: 'ex-3', projectId: 'p-konten', category: 'operasional', title: 'Iklan Instagram minggu 2', amount: 750_000, date: relDay(-3) },
  { id: 'ex-4', projectId: 'p-batik', category: 'transport', title: 'Survei lokasi workshop batik', amount: 350_000, date: relDay(-2) },
];

export const seedAttendances: Attendance[] = [
  { id: 'att-1', userId: 'usr-dimas', date: relDay(0), checkIn: '08:52', status: 'hadir', location: 'Kantor Studio Nusa' },
  { id: 'att-2', userId: 'usr-bayu', date: relDay(0), checkIn: '09:18', status: 'terlambat', location: 'Remote · Bandung' },
  { id: 'att-3', userId: 'usr-nadia', date: relDay(0), checkIn: '08:45', status: 'hadir', location: 'Kantor Studio Nusa' },
  { id: 'att-4', userId: 'usr-rina', date: relDay(-1), checkIn: '08:30', checkOut: '17:20', status: 'hadir', location: 'Kantor Studio Nusa' },
  { id: 'att-5', userId: 'usr-dimas', date: relDay(-1), checkIn: '08:55', checkOut: '17:40', status: 'hadir', location: 'Kantor Studio Nusa' },
  { id: 'att-6', userId: 'usr-bayu', date: relDay(-1), checkIn: '08:58', checkOut: '18:05', status: 'hadir', location: 'Remote · Bandung' },
];

export const seedLeaves: LeaveRequest[] = [
  { id: 'lv-1', userId: 'usr-nadia', type: 'tahunan', startDate: relDay(12), endDate: relDay(14), reason: 'Acara keluarga di Yogyakarta', status: 'pending' },
  { id: 'lv-2', userId: 'usr-bayu', type: 'sakit', startDate: relDay(-9), endDate: relDay(-9), reason: 'Demam', status: 'approved' },
];

export const seedAutomations: AutomationRule[] = [
  { id: 'au-1', name: 'Pindah ke Review → kabari penanggung jawab', trigger: 'status_changed', triggerValue: 'review', action: 'notify_assignee', isActive: true, runCount: 14 },
  { id: 'au-2', name: 'Tugas rampung → kabari klien lewat WhatsApp', trigger: 'status_changed', triggerValue: 'done', action: 'notify_client', isActive: true, runCount: 6 },
  { id: 'au-3', name: 'Tenggat besok → pengingat WhatsApp', trigger: 'due_soon', action: 'notify_whatsapp', isActive: false, runCount: 0 },
];
