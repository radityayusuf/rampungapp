import 'dotenv/config';
import http from 'http';
import path from 'path';
import { createApp, getAllowedOrigins } from './app';
import { initSocket } from './socket';
import { loadPlanConfig } from './services/planConfig';

const port = parseInt(process.env.PORT || '8000', 10);
const app = createApp();

// Pengaman terakhir: error async yang lolos tidak boleh mematikan server.
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

const server = http.createServer(app);
initSocket(server, getAllowedOrigins());

// Konfigurasi paket (harga & batas) dimuat dari database sebelum menerima permintaan.
loadPlanConfig()
  .catch((e) => console.error('Gagal memuat konfigurasi paket, memakai bawaan:', e))
  .finally(() => server.listen(port, () => {
  console.log(`🚀 Rampung Node.js Backend berjalan di http://localhost:${port}`);
  console.log(`🔌 WebSocket aktif di ws://localhost:${port}`);
  console.log(`📂 Direktori uploads: ${path.join(__dirname, '../uploads')}`);
}));
