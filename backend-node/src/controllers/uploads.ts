import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { prisma } from '../db';
import { AuthRequest } from '../types';

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, unique);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
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

  res.sendFile(filePath);
}
