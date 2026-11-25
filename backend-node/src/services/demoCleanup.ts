import { prisma } from '../db';

/** [koleksi, id, kolom sidik, awal nilai] — data contoh lama "Studio Nusa" (dulu frontend/src/data/seed.ts). */
export const DEMO: [string, string, string, string][] = [
  ["members", "usr-dimas", "name", "Dimas Aditya"],
  ["members", "usr-bayu", "name", "Bayu Wicaksono"],
  ["members", "usr-nadia", "name", "Nadia Putri"],
  ["spaces", "sp-web", "name", "Website Klien"],
  ["spaces", "sp-sosmed", "name", "Konten Sosmed"],
  ["spaces", "sp-ops", "name", "Operasional"],
  ["projects", "p-sinar", "name", "Peluncuran Website PT Sinar Jaya"],
  ["projects", "p-konten", "name", "Konten Instagram November"],
  ["projects", "p-kasir", "name", "Aplikasi Kasir Kopi Senja"],
  ["projects", "p-batik", "name", "Rebranding Batik Laras"],
  ["projects", "p-ops", "name", "Laporan Operasional Q4"],
  ["tasks", "t-riset", "title", "Riset referensi desain kompetitor"],
  ["tasks", "t-kebutuhan", "title", "Daftar kebutuhan halaman klien"],
  ["tasks", "t-kampanye", "title", "Ide kampanye peluncuran"],
  ["tasks", "t-beranda", "title", "Desain halaman beranda"],
  ["tasks", "t-laravel", "title", "Setup Laravel dan autentikasi"],
  ["tasks", "t-copy", "title", "Copywriting halaman Tentang Kami"],
  ["tasks", "t-qris", "title", "Integrasi pembayaran QRIS"],
  ["tasks", "t-logo", "title", "Logo dan palet warna klien"],
  ["tasks", "t-kickoff", "title", "Kickoff meeting dengan klien"],
  ["tasks", "t-kontrak", "title", "Kontrak dan timeline proyek"],
  ["tasks", "t-dev", "title", "Pengembangan halaman"],
  ["tasks", "t-qa", "title", "QA dan revisi klien"],
  ["tasks", "t-launch", "title", "Peluncuran website"],
  ["tasks", "t-posting3", "title", "Jadwal posting minggu 3"],
  ["tasks", "t-feed12", "title", "Desain feed minggu 1 dan 2"],
  ["tasks", "t-caption2", "title", "Caption dan hashtag minggu 2"],
  ["tasks", "t-insight", "title", "Laporan insight Oktober"],
  ["tasks", "t-story", "title", "Desain story promo akhir bulan"],
  ["tasks", "t-wireframe-kasir", "title", "Wireframe menu kasir"],
  ["tasks", "t-db-kasir", "title", "Database menu dan stok bahan"],
  ["tasks", "t-printer", "title", "Integrasi printer struk"],
  ["tasks", "t-kickoff-kasir", "title", "Kickoff tahap 2 dengan Kopi Senja"],
  ["tasks", "t-moodboard", "title", "Moodboard rebranding"],
  ["tasks", "t-foto", "title", "Foto produk untuk katalog"],
  ["tasks", "t-riset-batik", "title", "Riset pasar batik online"],
  ["tasks", "t-rekap-okt", "title", "Rekap pengeluaran Oktober"],
  ["tasks", "t-rapat", "title", "Rapat internal mingguan"],
  ["tasks", "t-tagih-batik", "title", "Tagih DP Batik Laras"],
  ["tasks", "t-notulen", "title", "Susun notulen rapat mingguan"],
  ["tasks", "t-server", "title", "Perpanjang server dan domain"],
  ["comments", "c-1", "content", "@Dimas klien minta hero pakai foto tim, "],
  ["comments", "c-2", "content", "Siap, versi baru saya unggah besok pagi."],
  ["comments", "c-3", "content", "@Rina draf sejarah perusahaan sudah saya"],
  ["comments", "c-4", "content", "Webhook sudah jalan di sandbox. Tinggal "],
  ["activities", "a-1", "text", "memindahkan \"Integrasi pembayaran QRIS\" "],
  ["activities", "a-2", "text", "mengunggah 2 file ke \"Desain halaman ber"],
  ["activities", "a-3", "text", "menyebut @Rina di \"Copywriting halaman T"],
  ["activities", "a-4", "text", "menyelesaikan \"Kontrak dan timeline proy"],
  ["activities", "a-5", "text", "menambahkan dependensi di \"Desain halama"],
  ["activities", "a-6", "text", "mengubah status \"Desain halaman beranda\""],
  ["activities", "a-7", "text", "membuat tugas \"Desain halaman beranda\""],
  ["notifications", "n-1", "text", "memindahkan \"Integrasi pembayaran QRIS\" "],
  ["notifications", "n-2", "text", "menyebut kamu di \"Copywriting halaman Te"],
  ["notifications", "n-3", "text", "membalas di \"Desain halaman beranda\": Si"],
  ["notifications", "n-4", "text", "\"Integrasi pembayaran QRIS\" lewat tengga"],
  ["notifications", "n-5", "text", "menugaskan kamu ke \"Daftar kebutuhan hal"],
  ["timeEntries", "te-1", "taskTitle", "Desain halaman beranda"],
  ["timeEntries", "te-2", "taskTitle", "Integrasi pembayaran QRIS"],
  ["timeEntries", "te-3", "taskTitle", "Rapat internal mingguan"],
  ["timeEntries", "te-4", "taskTitle", "Jadwal posting minggu 3"],
  ["timeEntries", "te-5", "taskTitle", "Setup Laravel dan autentikasi"],
  ["timeEntries", "te-6", "taskTitle", "Logo dan palet warna klien"],
  ["timeEntries", "te-7", "taskTitle", "Database menu dan stok bahan"],
  ["timeEntries", "te-8", "taskTitle", "Desain halaman beranda"],
  ["timeEntries", "te-9", "taskTitle", "Integrasi pembayaran QRIS"],
  ["timeEntries", "te-10", "taskTitle", "Copywriting halaman Tentang Kami"],
  ["timeEntries", "te-11", "taskTitle", "Setup Laravel dan autentikasi"],
  ["timeEntries", "te-12", "taskTitle", "Logo dan palet warna klien"],
  ["timeEntries", "te-13", "taskTitle", "Kickoff meeting dengan klien"],
  ["clients", "cl-sinar", "company", "PT Sinar Jaya"],
  ["clients", "cl-batik", "company", "Batik Laras"],
  ["clients", "cl-kopi", "company", "Kopi Senja"],
  ["clients", "cl-pena", "company", "Toko Buku Pena"],
  ["clients", "cl-puri", "company", "Hotel Puri Asri"],
  ["clients", "cl-medika", "company", "Klinik Sehat Medika"],
  ["clients", "cl-mentari", "company", "Toko Roti Mentari"],
  ["clients", "cl-koperasi", "company", "Koperasi Maju Bersama"],
  ["clients", "cl-tani", "company", "CV Tani Makmur"],
  ["clients", "cl-bina", "company", "Sekolah Bina Insani"],
  ["clients", "cl-arunika", "company", "Arunika Travel"],
  ["deals", "d-1", "need", "Website profil dan booking dokter"],
  ["deals", "d-2", "need", "Konten Instagram 3 bulan"],
  ["deals", "d-3", "need", "Aplikasi simpan pinjam"],
  ["deals", "d-4", "need", "Redesain website dan SEO"],
  ["deals", "d-5", "need", "Sistem stok gudang"],
  ["deals", "d-6", "need", "Portal akademik"],
  ["deals", "d-7", "need", "Aplikasi kasir tahap 2"],
  ["deals", "d-8", "need", "Website perusahaan"],
  ["deals", "d-9", "need", "Rebranding dan katalog online"],
  ["deals", "d-10", "need", "Aplikasi pemesanan tur"],
  ["deals", "d-11", "need", "Toko online buku"],
  ["deals", "d-12", "need", "Sistem reservasi kamar"],
  ["invoices", "inv-14", "number", "INV-2026-014"],
  ["invoices", "inv-13", "number", "INV-2026-013"],
  ["invoices", "inv-12", "number", "INV-2026-012"],
  ["invoices", "inv-11", "number", "INV-2026-011"],
  ["invoices", "inv-10", "number", "INV-2026-010"],
  ["expenses", "ex-1", "title", "Lisensi font dan foto stok"],
  ["expenses", "ex-2", "title", "Printer thermal untuk uji coba"],
  ["expenses", "ex-3", "title", "Iklan Instagram minggu 2"],
  ["expenses", "ex-4", "title", "Survei lokasi workshop batik"],
  ["attendances", "att-1", "checkIn", "08:52"],
  ["attendances", "att-2", "checkIn", "09:18"],
  ["attendances", "att-3", "checkIn", "08:45"],
  ["attendances", "att-4", "checkIn", "08:30"],
  ["attendances", "att-5", "checkIn", "08:55"],
  ["attendances", "att-6", "checkIn", "08:58"],
  ["leaves", "lv-1", "reason", "Acara keluarga di Yogyakarta"],
  ["leaves", "lv-2", "reason", "Demam"],
  ["automations", "au-1", "name", "Pindah ke Review → kabari penanggung jaw"],
  ["automations", "au-2", "name", "Tugas rampung → kabari klien lewat Whats"],
  ["automations", "au-3", "name", "Tenggat besok → pengingat WhatsApp"]
];

export interface DemoCleanupReport {
  total: number;
  workspaces: { id: number; name: string; count: number; byCollection: Record<string, number> }[];
  applied: boolean;
}

/**
 * Cari (dan bila apply=true, hapus) data contoh lama. Sebuah catatan dihapus hanya bila koleksi + ID + isinya
 * cocok persis dengan data contoh, ditambah catatan yang merujuk proyek/tugas contoh tersebut.
 * Data buatan pengguna tidak disentuh. Nomor revisi workspace dinaikkan agar perangkat yang terbuka menarik ulang.
 */
export async function cleanDemoData(opts: { apply: boolean; workspaceIds?: bigint[] }): Promise<DemoCleanupReport> {
  const demoKeys = new Map(DEMO.map(([c, id, field, val]) => [`${c}|${id}`, { field, val }]));
  const rows = await prisma.records.findMany({
    where: { ...(opts.workspaceIds ? { workspace_id: { in: opts.workspaceIds } } : {}), rid: { in: [...new Set(DEMO.map((d) => d[1]))] } },
    select: { id: true, workspace_id: true, collection: true, rid: true, data: true },
  });

  const victims = new Map<bigint, { ws: bigint; collection: string }>();
  const demoProjects = new Map<bigint, Set<string>>();
  const demoTasks = new Map<bigint, Set<string>>();
  const add = (m: Map<bigint, Set<string>>, ws: bigint, rid: string) => { if (!m.has(ws)) m.set(ws, new Set()); m.get(ws)!.add(rid); };
  for (const r of rows) {
    const fp = demoKeys.get(`${r.collection}|${r.rid}`);
    if (!fp) continue;
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(r.data); } catch { continue; }
    const v = data[fp.field];
    if (typeof v !== 'string' || !v.startsWith(fp.val)) continue; // isi berbeda → milik pengguna
    victims.set(r.id, { ws: r.workspace_id, collection: r.collection });
    if (r.collection === 'projects') add(demoProjects, r.workspace_id, r.rid);
    if (r.collection === 'tasks') add(demoTasks, r.workspace_id, r.rid);
  }

  const touched = new Set([...victims.values()].map((v) => v.ws));
  for (const ws of touched) {
    const projects = demoProjects.get(ws) ?? new Set<string>();
    const tasks = demoTasks.get(ws) ?? new Set<string>();
    const refs = await prisma.records.findMany({
      where: { workspace_id: ws, collection: { in: ['tasks', 'comments', 'activities', 'notifications', 'timeEntries', 'invoices', 'expenses'] } },
      select: { id: true, collection: true, data: true },
    });
    for (const r of refs) {
      if (victims.has(r.id)) continue;
      let d: Record<string, unknown> = {};
      try { d = JSON.parse(r.data); } catch { continue; }
      if ((typeof d.taskId === 'string' && tasks.has(d.taskId)) || (typeof d.projectId === 'string' && projects.has(d.projectId))) {
        victims.set(r.id, { ws, collection: r.collection });
      }
    }
  }

  const names = new Map((await prisma.workspaces.findMany({ where: { id: { in: [...touched] } }, select: { id: true, name: true } })).map((w) => [w.id, w.name]));
  const report: DemoCleanupReport = {
    total: victims.size,
    applied: false,
    workspaces: [...touched].map((ws) => {
      const list = [...victims.values()].filter((v) => v.ws === ws);
      const byCollection: Record<string, number> = {};
      for (const v of list) byCollection[v.collection] = (byCollection[v.collection] ?? 0) + 1;
      return { id: Number(ws), name: names.get(ws) ?? '', count: list.length, byCollection };
    }),
  };

  if (opts.apply && victims.size) {
    await prisma.$transaction(async (tx) => {
      await tx.records.deleteMany({ where: { id: { in: [...victims.keys()] } } });
      for (const ws of touched) await tx.workspaces.update({ where: { id: ws }, data: { rev: { increment: 1 } } });
    });
    report.applied = true;
  }
  return report;
}
