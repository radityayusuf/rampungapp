import { Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { AuthRequest } from '../types';

/**
 * Foto profil. Klien sudah memotong & mengecilkan foto (256×256 JPEG), server hanya menerima gambar sungguhan
 * (dicek dari isi berkas, bukan nama/tipe kiriman), menyimpannya dengan nama acak, dan menghapus foto lama
 * milik pengguna yang sama. Tidak dihitung ke kuota penyimpanan workspace.
 */
const dir = path.join(__dirname, '../../uploads/avatars');
fs.mkdirSync(dir, { recursive: true });

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const avatarMiddleware = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } });

/** Ekstensi dari tanda tangan berkas; null bila bukan JPEG/PNG/WebP. */
function sniff(b: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Pola URL foto milik pengguna tertentu; dipakai juga untuk memvalidasi catatan anggota di sinkronisasi. */
export const avatarPattern = (userId: string | number) => new RegExp(`^/avatars/u${userId}-[a-f0-9]{24}\\.(jpg|png|webp)$`);

const removeOld = (userId: number | bigint, keep?: string) => {
  for (const f of fs.readdirSync(dir)) if (f.startsWith(`u${userId}-`) && f !== keep) fs.rmSync(path.join(dir, f), { force: true });
};

export async function uploadAvatar(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'Sesi tidak valid.' });
    return;
  }
  const file = req.file;
  const ext = file ? sniff(file.buffer) : null;
  if (!file || !ext) {
    res.status(422).json({ message: 'Berkas harus berupa gambar JPG, PNG, atau WebP.' });
    return;
  }
  const name = `u${user.id}-${crypto.randomBytes(12).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), file.buffer);
  removeOld(user.id, name);
  res.status(201).json({ url: `/avatars/${name}` });
}

export async function deleteAvatar(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'Sesi tidak valid.' });
    return;
  }
  removeOld(user.id);
  res.json({ ok: true });
}

const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Publik (nama berkas acak & tak tertebak), agar bisa dipakai langsung di <img>. */
export async function getAvatar(req: AuthRequest, res: Response): Promise<void> {
  const name = path.basename(String(req.params.file || ''));
  const type = TYPES[path.extname(name)];
  const full = path.join(dir, name);
  if (!/^u\d+-[a-f0-9]{24}\.(jpg|png|webp)$/.test(name) || !type || !fs.existsSync(full)) {
    res.status(404).json({ message: 'Foto tidak ditemukan.' });
    return;
  }
  res.setHeader('Content-Type', type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  // Nama berkas berubah setiap kali foto diganti, jadi aman disimpan lama oleh browser.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.sendFile(full);
}
