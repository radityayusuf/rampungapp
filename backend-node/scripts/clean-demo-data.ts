/**
 * Bersihkan DATA CONTOH lama ("Studio Nusa": proyek Website PT Sinar Jaya, anggota Dimas/Bayu/Nadia, dll.)
 * yang dulu disuntikkan fitur data demo. Data buatan pengguna TIDAK disentuh.
 *
 *   npm run clean:demo                         # pratinjau (tidak menghapus)
 *   npm run clean:demo -- --apply              # hapus di semua workspace
 *   npm run clean:demo -- --email=a@b.com --apply   # hanya workspace milik email itu
 */
import 'dotenv/config';
import { prisma } from '../src/db';
import { cleanDemoData } from '../src/services/demoCleanup';

(async () => {
  const apply = process.argv.includes('--apply');
  const email = process.argv.find((a) => a.startsWith('--email='))?.slice('--email='.length).toLowerCase();
  let workspaceIds: bigint[] | undefined;
  if (email) {
    const u = await prisma.users.findFirst({ where: { email } });
    if (!u?.workspace_id) {
      console.error(`Akun ${email} tidak ditemukan atau tanpa workspace.`);
      process.exit(1);
    }
    workspaceIds = [u.workspace_id];
  }
  const r = await cleanDemoData({ apply, workspaceIds });
  if (!r.total) console.log('Tidak ada data contoh yang ditemukan. Database sudah bersih.');
  for (const w of r.workspaces) {
    console.log(`Workspace #${w.id} "${w.name}": ${w.count} catatan data contoh`);
    console.log('  ' + Object.entries(w.byCollection).map(([c, n]) => `${c}: ${n}`).join(', '));
  }
  if (r.total && !r.applied) console.log('
PRATINJAU saja — belum ada yang dihapus. Jalankan ulang dengan --apply untuk menghapus.');
  if (r.applied) console.log(`
Selesai: ${r.total} catatan data contoh dihapus. Muat ulang halaman Rampung di peramban.`);
  await prisma.$disconnect();
})();
