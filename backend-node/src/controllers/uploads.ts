import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { prisma } from '../db';
import { AuthRequest } from '../types';
import { LIMITS, PLAN_LABEL, formatGb } from '../services/plans';
import { planOf } from '../services/workspacePlan';

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // Nama acak tak tertebak; ekstensi dari daftar yang diizinkan saja.
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});

// Tipe yang boleh diunggah. HTML/SVG/JS sengaja tidak ada: dari origin API mereka bisa menjalankan skrip.
const ALLOWED_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt', '.csv', '.md', '.zip',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.fig', '.mp4', '.mov', '.mp3',
]);
const INLINE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf']);

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 }, // 25 MB max
  fileFilter: (_req, file, cb) => {
    const ok = ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase());
    if (ok) cb(null, true);
    else cb(new Error('TIPE_FILE_DITOLAK'));
  },
});

export async function uploadFile(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user || !user.workspace_id) {
    res.status(401).json({ message: 'Sesi tidak valid.' });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(422).json({ message: 'Tidak ada file yang diunggah.' });
    return;
  }

  // Batas penyimpanan paket (mis. Gratis 1 GB): berkas yang melampaui batas dihapus lagi dan ditolak.
  const p = await planOf(user.workspace_id);
  const max = LIMITS[p.plan].storageBytes;
  if (max !== null) {
    const used = await prisma.uploads.aggregate({ where: { workspace_id: user.workspace_id }, _sum: { size: true } });
    if (Number(used._sum.size ?? 0) + file.size > max) {
      fs.rmSync(file.path, { force: true });
      res.status(402).json({ message: `Penyimpanan paket ${PLAN_LABEL[p.plan]} (${formatGb(max)}) sudah penuh. Hapus lampiran lama atau tingkatkan paket.` });
      return;
    }
  }

  const record = await prisma.uploads.create({
    data: {
      workspace_id: user.workspace_id,
      original_name: file.originalname,
      stored_name: file.filename,
      mime_type: file.mimetype,
      size: BigInt(file.size),
      uploaded_by: user.id,
    },
  });

  res.status(201).json({
    id: Number(record.id),
    name: file.originalname,
    storedName: file.filename,
    size: file.size,
    mimeType: file.mimetype,
    url: `/api/uploads/${file.filename}`,
    uploadedAt: record.created_at?.toISOString() || new Date().toISOString(),
  });
}

export async function getFile(req: AuthRequest, res: Response): Promise<void> {
  const filename = String(req.params.filename || '');
  // Prevent directory traversal
  const safeFilename = path.basename(filename);
  const filePath = path.join(uploadDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ message: 'File tidak ditemukan.' });
    return;
  }

  // Gambar/PDF boleh tampil di browser; selebihnya selalu diunduh, tidak pernah dieksekusi.
  const inline = INLINE_EXT.has(path.extname(safeFilename).toLowerCase());
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Content-Disposition', inline ? 'inline' : 'attachment');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(filePath);
}
