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

## Fitur dan statusnya

Prinsip: fitur yang bergantung pada layanan luar **tidak pernah berpura-pura berhasil**. Tanpa kredensial, fitur itu
menjawab "belum dikonfigurasi" (HTTP 503) dan UI menampilkannya apa adanya. Halaman **Integrasi** menunjukkan status nyata
dari `GET /api/integrations/status`. Tidak ada mode lokal maupun data contoh: semua data berasal dari server setelah masuk.

Cek kredensial yang sudah diisi (memanggil API penyedia secara baca-saja, tanpa menagih atau mengirim pesan):

```bash
cd backend-node && npm run check:integrations
```

### Berjalan penuh tanpa konfigurasi tambahan
- Akun (daftar/masuk/keluar, token per perangkat, sesi kedaluwarsa 30 hari tidak dipakai), lupa & atur ulang kata sandi.
- Tim: undangan, peran pemilik/admin/anggota (ditegakkan di server), keluarkan anggota, token API pribadi.
- Proyek & tugas: Kanban, List, Kalender, Timeline, Tabel, Docs, subtask, komentar & @mention, dependensi, template,
  otomasi jika–maka, burndown, ringkasan proyek (dihitung server dari data nyata), ekspor CSV & kalender `.ics`.
- Sinkronisasi antar perangkat/anggota (rev atomik, polling 8 detik), portal klien publik baca-saja, unggah lampiran.
- Modul Time Tracking, CRM, Keuangan (invoice, pengeluaran, tandai lunas manual), SDM, panel Administrator Sistem.

### Aktif setelah kredensial diisi di `backend-node/.env`
| Fitur | Variabel | Tanpa kredensial |
|---|---|---|
| WhatsApp (Business Cloud API, Meta) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | 503; otomasi WhatsApp "dilewati" dengan alasan |
| Asisten AI pemecah tugas (Claude) | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Memakai template kata kunci, diberi label "bukan AI" |
| Email undangan & reset sandi (HTML bermerek) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` — Gmail: `smtp.gmail.com`, port 587, Sandi Aplikasi; `MAIL_FROM` = email yang sama | Tautan dicetak di log server; UI menyatakan email gagal dikirim. Uji: `npm run test:email -- alamat@contoh.com` |
| Login Google | `GOOGLE_CLIENT_ID` (+ origin terdaftar di Google Cloud) | Tombol Google tidak berfungsi |
| Superadmin awal | `SUPERADMIN_EMAILS` (email harus terverifikasi Google) | Hanya role `superadmin` di database |

**Pembayaran:** tidak memakai penyedia pembayaran luar (tanpa Midtrans). Paket Pro/Bisnis dibayar lewat QRIS atau transfer
rekening milik platform, yang diatur di **Panel Superadmin → Pengaturan pembayaran** (lihat di bawah). Invoice untuk klien
Anda dilunasi dengan "Tandai lunas (manual)" setelah dana masuk ke rekening/kas Anda sendiri.

**WhatsApp:** Meta hanya mengirim pesan teks bebas ke penerima yang menghubungi nomor bisnis dalam 24 jam terakhir;
di luar itu dibutuhkan pesan template yang disetujui (belum didukung). Status "accepted" berarti diterima Meta, bukan dibaca.

### Paket & penagihan (ditegakkan server)
Harga, batas, masa uji coba, jumlah modul Pro, dan isi halaman harga **dapat diubah Superadmin** di
**Panel Superadmin → Paket & harga** (tersimpan di database, langsung berlaku di checkout, batas, dan halaman depan).
Nilai bawaan:

| Paket | Harga | Batas & fitur |
|---|---|---|
| Gratis | Rp0 | 5 anggota, 3 proyek aktif, 1 GB; modul bisnis nonaktif |
| Pro | Rp149.000/tim/bulan | Sampai 10 anggota; proyek tanpa batas; 1 modul bisnis (Time Tracking/CRM/Keuangan/SDM) |
| Bisnis | Rp349.000/tim/bulan | Sampai 30 anggota; semua modul, Integrasi, WhatsApp, Asisten AI, webhook, portal klien |
| Enterprise | Negosiasi | Ditetapkan Superadmin di **Workspace & paket** |

- Workspace baru mulai di **Gratis**. Pemilik membeli lewat **Pengaturan → Kelola paket** dalam tiga langkah:
  **pilih paket** (kartu terpilih + ringkasan pesanan) → **bayar & unggah bukti** → **verifikasi**.
- **Harga tetap per tim** (paket bertingkat, bukan per pengguna): server membuat tagihan harga paket × bulan ditagih (tahunan dibayar 10 bulan untuk 12), **+ kode unik Rp1–999**, berlaku 48 jam. Batas anggota paket ditegakkan server; checkout ditolak bila anggota saat ini melebihi batas paket yang dipilih.
  Pembeli transfer lewat QRIS/rekening, mengunggah bukti (PNG/JPG/WebP/PDF, maks 5 MB), lalu Superadmin menyetujui atau
  menolak dengan alasan. Beralih paket membatalkan tagihan lama yang belum dibayar. Bukti hanya bisa dibuka pembeli dan Superadmin.
- Perpanjangan paket yang sama ditambahkan ke akhir masa aktif; tidak diperpanjang otomatis; masa habis → kembali ke Gratis.
- Pelanggaran batas ditolak server: anggota (402), proyek aktif (403), penyimpanan (402), fitur di atas paket (402).
- Setelah naik paket, aktifkan modul di **Toko modul** (modul tidak dinyalakan otomatis).

### Panel Superadmin (`#/admin`)
Terpisah dari tampilan workspace. Superadmin yang login langsung diarahkan ke sini; tautan "Workspace pribadi" dan
menu akun → "Panel Superadmin" untuk berpindah.

- **Dasbor:** pengguna, workspace (berbayar/gratis), pendapatan, antrean verifikasi, sebaran paket, kondisi sistem.
- **Workspace & paket:** status dan masa aktif paket; tetapkan paket/masa aktif secara manual.
- **Pengguna:** cari, ubah peran, hapus akun.
- **Paket & harga:** editor harga, batas, uji coba, modul Pro, dan isi halaman harga.
- **Pembayaran:** tab status, pencarian, rentang tanggal, lihat bukti, **Setujui** (aman dari klik ganda/serentak) / **Tolak**
  (wajib beralasan), ekspor **Excel (.xlsx)** dan **CSV** (sel berawalan `=`/`+`/`-`/`@` dinetralkan).
- **Pengaturan pembayaran:** gambar QRIS (isi berkas diperiksa, ≤ 1 MB), nama merchant, hingga 10 rekening, petunjuk, kode unik.
- **Kesehatan & integrasi:** server, database, penyimpanan, status Google/SMTP/WhatsApp/AI/pembayaran.
- Superadmin pertama: isi `SUPERADMIN_EMAILS` (email terverifikasi Google) atau set role `superadmin` di database.

### Belum ada
- Pengiriman otomatis ke Slack/Discord saat tugas berubah (yang ada: uji kirim manual, khusus alamat webhook resmi).
- Otomasi berjalan di browser pemicu; aksi WhatsApp hanya terkirim bila dipicu pemilik/admin.

## Pengujian

```bash
cd backend-node && npm test     # 224 tes (memakai database terpisah rampung_test, dibuat otomatis)
cd frontend && npm test         # tes unit
```
