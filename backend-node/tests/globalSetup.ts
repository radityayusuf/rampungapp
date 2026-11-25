import { execSync } from 'node:child_process';
import path from 'node:path';

export default function setup() {
  const url = process.env.TEST_DATABASE_URL || 'mysql://root:@127.0.0.1:3306/rampung_test';
  const dbName = new URL(url).pathname.replace('/', '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Menolak menjalankan tes: nama database "${dbName}" harus berakhiran "_test" agar data nyata tidak terhapus.`);
  }
  // Membuat database tes bila belum ada, dan menyamakan skemanya dengan prisma/schema.prisma.
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
