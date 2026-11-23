import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { apiRouter } from './routes/api';
import { initSocket } from './socket';

// BigInt JSON serialization
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || '8000', 10);

// CORS configuration
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Dev-friendly fallback
      }
    },
    credentials: true,
  })
);

// Security Headers matching Laravel SecurityHeaders middleware
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads folder
const uploadsDir = path.join(__dirname, '../uploads');
app.use('/api/uploads', express.static(uploadsDir));

// API routes
app.use('/api', apiRouter);

// Fallback 404
app.use((_req, res) => {
  res.status(404).json({ message: 'Rute tidak ditemukan.' });
});

// Create HTTP server and initialize Socket.io
const server = http.createServer(app);
initSocket(server, allowedOrigins);

server.listen(port, () => {
  console.log(`🚀 Rampung Node.js Backend berjalan di http://localhost:${port}`);
  console.log(`🔌 WebSocket aktif di ws://localhost:${port}`);
  console.log(`📂 Direktori uploads: ${uploadsDir}`);
});
