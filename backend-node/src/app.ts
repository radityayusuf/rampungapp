import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/api';

// BigInt JSON serialization
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
  return Number(this);
};

export function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Aplikasi Express lengkap (tanpa server HTTP/Socket), dipakai oleh index.ts dan oleh tes
 * sehingga tes menjalankan tumpukan middleware yang sama persis dengan produksi.
 */
export function createApp(): express.Express {
  const app = express();
  const allowedOrigins = getAllowedOrigins();

  app.use(
    cors({
      // Tanpa header Origin (curl, server-ke-server) diizinkan; browser hanya dari daftar CORS_ORIGIN.
      origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
      credentials: true,
    }),
  );

  // Header keamanan dasar
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Isi 1 jika di belakang nginx/Docker agar batas per-IP memakai IP klien asli.
  app.set('trust proxy', parseInt(process.env.TRUST_PROXY || '0', 10));
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use('/api', apiRouter);

  // JSON rusak, upload ditolak/terlalu besar, dan error tak terduga
  app.use((err: Error & { code?: string; type?: string; status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.message === 'TIPE_FILE_DITOLAK') {
      res.status(415).json({ message: 'Tipe berkas ini tidak diizinkan.' });
    } else if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ message: 'Ukuran berkas melebihi batas yang diizinkan.' });
    } else if (err.type === 'entity.too.large') {
      res.status(413).json({ message: 'Data terlalu besar.' });
    } else if (err.type === 'entity.parse.failed') {
      res.status(400).json({ message: 'Format JSON tidak valid.' });
    } else {
      console.error('Unhandled error:', err);
      res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ message: 'Rute tidak ditemukan.' });
  });

  return app;
}
