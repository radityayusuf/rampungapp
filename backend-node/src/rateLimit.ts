import rateLimit from 'express-rate-limit';

const perMinute = () => Math.max(1, parseInt(process.env.AUTH_THROTTLE || '10', 10));

const tooMany = { message: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.' };

/** Batas per IP untuk semua endpoint autentikasi publik (login, daftar, lupa/reset sandi, Google). */
export const authIpLimiter = rateLimit({
  windowMs: 60_000,
  limit: perMinute,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});

/** Batas per akun: 5 percobaan login GAGAL per menit per email, agar sandi tidak bisa ditebak dari banyak IP. */
export const loginAccountLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
  keyGenerator: (req) => `login:${String(req.body?.email ?? '').toLowerCase().trim() || req.ip}`,
});

/** Batas untuk endpoint publik baca (portal, info undangan). */
export const publicReadLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: tooMany });

const userKey = (req: unknown) => `u:${String((req as { user?: { id?: bigint | number } }).user?.id ?? 'anon')}`;

/** Pembatas per pengguna terautentikasi (bukan per IP): menjaga kuota pesan WhatsApp, panggilan AI, dan webhook. */
export const userLimiter = (limit: number, windowMs = 60_000) =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: tooMany, keyGenerator: userKey });

/** Webhook masuk dari penyedia pembayaran (per IP, longgar). */
