/**
 * Pemeriksa koneksi integrasi: menghubungi tiap layanan SUNGGUHAN dengan kredensial di .env,
 * memakai panggilan baca-saja (tidak membuat transaksi, tidak mengirim pesan).
 *
 *   npm run check:integrations
 */
import 'dotenv/config';
import nodemailer from 'nodemailer';
import { prisma } from '../src/db';
import { getPaymentSettings } from '../src/services/paymentSettings';

type Result = { name: string; status: 'ok' | 'fail' | 'skip' | 'warn'; detail: string };
const results: Result[] = [];
const add = (name: string, status: Result['status'], detail: string) => results.push({ name, status, detail });
const env = (k: string) => (process.env[k] || '').trim();

async function getJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { res, json };
}

async function checkDatabase() {
  try {
    const [{ v }] = await prisma.$queryRaw<{ v: string }[]>`SELECT VERSION() AS v`;
    const hasPayments = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'payments'`;
    add('Database', Number(hasPayments[0].n) ? 'ok' : 'warn', `MySQL ${v}${Number(hasPayments[0].n) ? '' : ' — tabel payments belum ada, jalankan: npx prisma db push'}`);
  } catch (e) {
    add('Database', 'fail', (e as Error).message.split('\n')[0]);
  }
}

async function checkPayments() {
  // Tujuan pembayaran paket diatur superadmin di panel Admin Sistem → Pembayaran (disimpan di database).
  const s = await getPaymentSettings();
  const parts = [s.qrisImage ? 'QRIS' : null, s.accounts.length ? `${s.accounts.length} rekening` : null].filter(Boolean);
  if (!parts.length) return add('Pembayaran paket', 'warn', 'Belum ada QRIS/rekening. Superadmin perlu mengisinya di Admin Sistem → Pembayaran; sebelum itu paket berbayar belum bisa dibeli.');
  add('Pembayaran paket', 'ok', `Tujuan pembayaran diatur: ${parts.join(' + ')}.`);
}

async function checkWhatsApp() {
  const token = env('WHATSAPP_TOKEN');
  const id = env('WHATSAPP_PHONE_NUMBER_ID');
  if (!token && !id) return add('WhatsApp (Meta)', 'skip', 'WHATSAPP_TOKEN dan WHATSAPP_PHONE_NUMBER_ID kosong.');
  if (!token || !id) return add('WhatsApp (Meta)', 'fail', 'Keduanya harus diisi: WHATSAPP_TOKEN dan WHATSAPP_PHONE_NUMBER_ID.');
  try {
    const { res, json } = await getJson(`https://graph.facebook.com/${env('WHATSAPP_API_VERSION') || 'v21.0'}/${id}?fields=display_phone_number,verified_name,quality_rating`, { Authorization: `Bearer ${token}` });
    if (res.ok) add('WhatsApp (Meta)', 'ok', `Terhubung ke ${json.display_phone_number} (${json.verified_name}), kualitas ${json.quality_rating ?? '-'}.`);
    else add('WhatsApp (Meta)', 'fail', `Meta menolak: ${json?.error?.message ?? `HTTP ${res.status}`}`);
  } catch (e) {
    add('WhatsApp (Meta)', 'fail', `Tidak dapat menghubungi Meta: ${(e as Error).message}`);
  }
}

async function checkAnthropic() {
  const key = env('ANTHROPIC_API_KEY');
  const model = env('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';
  if (!key) return add('Asisten AI (Claude)', 'skip', 'ANTHROPIC_API_KEY kosong — pemecah tugas memakai template berlabel "bukan AI".');
  try {
    const { res, json } = await getJson(`https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`, { 'x-api-key': key, 'anthropic-version': '2023-06-01' });
    if (res.ok) add('Asisten AI (Claude)', 'ok', `Kunci diterima; model ${json.id ?? model} tersedia.`);
    else if (res.status === 404) add('Asisten AI (Claude)', 'fail', `Kunci diterima, tetapi model "${model}" tidak ditemukan. Periksa ANTHROPIC_MODEL.`);
    else add('Asisten AI (Claude)', 'fail', `Anthropic menolak: ${json?.error?.message ?? `HTTP ${res.status}`}`);
  } catch (e) {
    add('Asisten AI (Claude)', 'fail', `Tidak dapat menghubungi Anthropic: ${(e as Error).message}`);
  }
}

async function checkSmtp() {
  const host = env('SMTP_HOST');
  if (!host) return add('Email (SMTP)', 'skip', 'SMTP_HOST kosong — tautan undangan/reset hanya dicetak di log server.');
  try {
    const t = nodemailer.createTransport({
      host,
      port: parseInt(env('SMTP_PORT') || '587', 10),
      secure: env('SMTP_SECURE') === 'true',
      auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined,
      connectionTimeout: 10_000,
    });
    await t.verify();
    add('Email (SMTP)', 'ok', `Login ke ${host} berhasil; email dikirim sebagai ${env('MAIL_FROM') || 'Rampung <no-reply@rampung.id>'}.`);
  } catch (e) {
    add('Email (SMTP)', 'fail', `SMTP gagal: ${(e as Error).message}`);
  }
}

function checkGoogleAndAccess() {
  const id = env('GOOGLE_CLIENT_ID');
  if (!id) add('Login Google', 'skip', 'GOOGLE_CLIENT_ID kosong — tombol Google tidak berfungsi.');
  else if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id)) add('Login Google', 'fail', 'Format GOOGLE_CLIENT_ID tidak dikenali.');
  else add('Login Google', 'warn', `Client ID terisi. Pastikan ${env('FRONTEND_URL') || 'alamat frontend'} terdaftar di "Authorized JavaScript origins" (Google Cloud Console); tidak bisa diperiksa dari server.`);

  const origins = (env('CORS_ORIGIN') || 'http://localhost:3000,http://127.0.0.1:3000').split(',').map((s) => s.trim());
  const fe = env('FRONTEND_URL');
  if (fe) add('CORS', origins.includes(new URL(fe).origin) ? 'ok' : 'fail', origins.includes(new URL(fe).origin) ? `FRONTEND_URL termasuk CORS_ORIGIN.` : `FRONTEND_URL (${fe}) tidak ada di CORS_ORIGIN; browser akan diblokir.`);
  add('Superadmin', env('SUPERADMIN_EMAILS') ? 'ok' : 'warn', env('SUPERADMIN_EMAILS') ? 'SUPERADMIN_EMAILS terisi (berlaku setelah email diverifikasi lewat Google).' : 'Tidak ada SUPERADMIN_EMAILS; panel sistem hanya untuk role superadmin di database.');
}

(async () => {
  await checkDatabase();
  await Promise.all([checkPayments(), checkWhatsApp(), checkAnthropic(), checkSmtp()]);
  checkGoogleAndAccess();
  const mark = { ok: '✓', fail: '✗', skip: '–', warn: '!' } as const;
  console.log('\nPemeriksaan integrasi Rampung\n');
  for (const r of results) console.log(`${mark[r.status]} ${r.name.padEnd(20)} ${r.detail}`);
  const fails = results.filter((r) => r.status === 'fail').length;
  console.log(`\n${fails ? `${fails} bermasalah.` : 'Tidak ada yang gagal.'} (✓ berfungsi · ! perlu dicek · – belum diisi · ✗ gagal)\n`);
  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
})();
