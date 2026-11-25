/**
 * Kirim satu email uji (format undangan) untuk memastikan SMTP berfungsi.
 *
 *   npm run test:email -- alamat@contoh.com
 *
 * Bila alamat tidak diberikan, email dikirim ke SMTP_USER (akun pengirim sendiri).
 */
import 'dotenv/config';
import { emailLayout, sendMail } from '../src/mail';

(async () => {
  const to = process.argv[2] || process.env.SMTP_USER;
  if (!process.env.SMTP_HOST) {
    console.error('SMTP_HOST kosong — isi pengaturan SMTP di backend-node/.env terlebih dahulu.');
    process.exit(1);
  }
  if (!to) {
    console.error('Tentukan alamat tujuan: npm run test:email -- alamat@contoh.com');
    process.exit(1);
  }
  const link = `${(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')}/#/masuk`;
  const ok = await sendMail(
    to,
    'Uji email Rampung — SMTP berfungsi',
    `Email ini membuktikan pengiriman email Rampung sudah berfungsi. Undangan anggota dan reset kata sandi kini terkirim otomatis.\n\n${link}`,
    emailLayout({
      preheader: 'Pengiriman email Rampung sudah berfungsi.',
      title: 'Email Rampung sudah berfungsi 🎉',
      bodyHtml: '<p style="margin:0;">Pengaturan SMTP berhasil. Mulai sekarang <b>undangan anggota</b> dan <b>tautan atur ulang kata sandi</b> dikirim otomatis ke email penerima, dengan tampilan seperti email ini.</p>',
      buttonText: 'Buka Rampung',
      buttonUrl: link,
      footnote: 'Email ini dikirim oleh skrip uji <code>npm run test:email</code>.',
    }),
  );
  console.log(ok ? `Terkirim ke ${to}. Periksa kotak masuk (atau folder Spam).` : 'Gagal mengirim — lihat pesan galat di atas.');
  process.exit(ok ? 0 : 1);
})();
