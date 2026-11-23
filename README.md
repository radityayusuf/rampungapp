# Rampung — Dari Ide Sampai Rampung

Aplikasi manajemen proyek & bisnis suite berbahasa Indonesia untuk tim UMKM, agensi, startup, kontraktor, dan kampus.

```
Rampung/
├── backend-node/  Node.js (TypeScript, Express, Prisma ORM, MySQL, Socket.io) — Backend Utama
├── backend/       Laravel (PHP 8.3+) + MySQL — Backend PHP (arsip/alternatif)
├── frontend/      React 18 + TypeScript + Vite + Tailwind CSS
├── docker-compose.yml  Konfigurasi kontainer siap pakai (MySQL + Backend + Frontend)
└── _backup/       Salinan arsip data lama
```

---

## 🚀 Cara Menjalankan

### 1. Database (MySQL di Laragon)
Pastikan MySQL di Laragon sudah aktif (klik **Start All** di Laragon). Database `rampung` dengan konfigurasi default Laragon (`root` tanpa password di port `3306`) akan langsung digunakan oleh backend Node.js.

Konfigurasi koneksi di `backend-node/.env`:
```env
DATABASE_URL="mysql://root:@127.0.0.1:3306/rampung"
PORT=8000
```

---

### 2. Menjalankan Backend (Node.js) — Terminal 1

```bash
cd backend-node
npm run dev
# Server aktif di http://localhost:8000
# WebSocket aktif di ws://localhost:8000
```

---

### 3. Menjalankan Frontend (React + Vite) — Terminal 2

```bash
cd frontend
npm run dev
# Buka di browser: http://localhost:3000
```

Atau dari direktori utama (root):
```bash
npm run dev:backend     # Menjalankan backend Node.js
npm run dev:frontend    # Menjalankan frontend Vite
```

---

### 4. Menjalankan via Docker Compose

Jika ingin menjalankan seluruh stack (termasuk MySQL 8.4) di dalam kontainer:

```bash
docker compose up --build
```
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- MySQL: `localhost:3306`

---

## 🌟 Fitur-Fitur yang Sudah Selesai

1. **Backend Node.js + MySQL**:
   - Express + TypeScript + Prisma ORM terkoneksi ke MySQL Laragon (`rampung`).
   - Otentikasi token multi-device berbasis hash SHA-256 (30 hari sesi perangkat / token API permanen).
   - Rate limiting, hashing kata sandi bcrypt 12 rounds, validasi kuat.
   - Real-time updates dengan **Socket.io** (`sync:update`, `user:online`, `notification:new`).

2. **Penyimpanan Berkas (File Uploads)**:
   - Endpoint upload berkas sungguhan (`POST /api/upload`) menggunakan Multer.
   - Berkas disimpan di direktori `backend-node/uploads/` dan disajikan via `GET /api/uploads/:filename`.
   - Di frontend `TaskPage.tsx`, lampiran berkas yang diunggah dapat langsung diunduh/dibuka melalui tautan.

3. **Integrasi QRIS Nasional**:
   - Endpoint `POST /api/integrations/qris/generate`: Menghasilkan QRIS dinamis dan gambar QR.
   - Endpoint `POST /api/integrations/qris/verify`: Memverifikasi pelunasan invoice dan mengupdate status di database serta broadcast real-time.
   - Halaman integrasi interaktif untuk pengujian pembuatan dan pelunasan QRIS langsung.

4. **Gateway WhatsApp**:
   - Endpoint `POST /api/integrations/whatsapp/send`: Pengiriman notifikasi otomatis untuk penugasan, perubahan status tugas, dan tagihan invoice.
   - Endpoint `GET /api/integrations/whatsapp/status`: Cek status gateway koneksi nomor WhatsApp bisnis.
   - Fitur uji coba kirim pesan WhatsApp langsung dari modal dan halaman integrasi.

5. **Asisten AI Proyek**:
   - Endpoint `POST /api/integrations/ai/breakdown`: Menganalisis judul & deskripsi tugas secara kontekstual (Desain, Coding, Proposal Bisnis, Acara) dan memecahnya menjadi daftar subtask terstruktur serta estimasi durasi.
   - Endpoint `POST /api/integrations/ai/summarize`: Menghitung persentase progres, status kesehatan proyek, dan rekomendasi langkah tindak lanjut tim.
   - Terintegrasi langsung dengan antarmuka modal Asisten AI di frontend.

6. **Kolaborasi Tim & Portal Klien**:
   - Undangan anggota tim via tautan token publik (`#/gabung/:token`).
   - Manajemen peran (Owner, Admin, Member) dan isolasi workspace.
   - Portal Klien read-only untuk pemantauan progres proyek (`#/portal/:token`).
