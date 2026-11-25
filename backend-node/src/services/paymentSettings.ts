import { prisma } from '../db';

/**
 * Tujuan pembayaran paket Rampung, diatur superadmin: gambar QRIS dan/atau rekening bank.
 * Disimpan di tabel platform_settings (kunci "payment"), bukan di .env, agar bisa diubah tanpa deploy ulang.
 */
export interface BankAccount {
  id: string;
  bank: string;
  number: string;
  holder: string;
}

export interface PaymentSettings {
  accounts: BankAccount[];
  /** Gambar QRIS sebagai data URL (PNG/JPEG/WebP, maks 1 MB) atau null. */
  qrisImage: string | null;
  /** Nama merchant yang tampil di QRIS, agar pembeli dapat mencocokkan sebelum membayar. */
  qrisName: string;
  instructions: string;
  /** Tambahkan 1–999 rupiah unik ke tiap tagihan agar transfer mudah dicocokkan. */
  uniqueCode: boolean;
}

const KEY = 'payment';
export const MAX_ACCOUNTS = 10;
export const QRIS_MAX_BYTES = 1024 * 1024;

export const emptySettings = (): PaymentSettings => ({ accounts: [], qrisImage: null, qrisName: '', instructions: '', uniqueCode: true });

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const row = await prisma.platform_settings.findUnique({ where: { key: KEY } });
  if (!row) return emptySettings();
  try {
    return { ...emptySettings(), ...(JSON.parse(row.value) as Partial<PaymentSettings>) };
  } catch {
    return emptySettings();
  }
}

export async function savePaymentSettings(s: PaymentSettings, userId: bigint): Promise<void> {
  const value = JSON.stringify(s);
  await prisma.platform_settings.upsert({ where: { key: KEY }, create: { key: KEY, value, updated_by: userId }, update: { value, updated_by: userId } });
}

export const isPaymentConfigured = (s: PaymentSettings) => !!s.qrisImage || s.accounts.length > 0;

/** Bagian yang aman ditampilkan ke pembeli. */
export const publicPaymentInfo = (s: PaymentSettings) => ({
  qrisImage: s.qrisImage,
  qrisName: s.qrisName,
  accounts: s.accounts,
  instructions: s.instructions,
});

const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

/** Validasi input superadmin. Mengembalikan pesan galat atau data bersih. */
export function parseSettingsInput(body: unknown, current: PaymentSettings): { error: string } | { value: PaymentSettings } {
  const b = (body ?? {}) as Record<string, unknown>;
  const rawAccounts = b.accounts;
  if (!Array.isArray(rawAccounts)) return { error: 'Daftar rekening tidak valid.' };
  if (rawAccounts.length > MAX_ACCOUNTS) return { error: `Maksimal ${MAX_ACCOUNTS} rekening.` };

  const accounts: BankAccount[] = [];
  for (const [i, raw] of rawAccounts.entries()) {
    const a = (raw ?? {}) as Record<string, unknown>;
    const bank = clean(a.bank, 60);
    const number = clean(a.number, 40);
    const holder = clean(a.holder, 100);
    if (!bank || !number || !holder) return { error: `Rekening ke-${i + 1}: bank, nomor, dan nama pemilik wajib diisi.` };
    if (!/^[0-9][0-9 .-]{3,38}[0-9]$/.test(number)) return { error: `Rekening ke-${i + 1}: nomor rekening hanya boleh berisi angka (4–40 karakter).` };
    accounts.push({ id: clean(a.id, 32) || `acc${Date.now().toString(36)}${i}`, bank, number, holder });
  }
  return {
    value: {
      accounts,
      qrisImage: current.qrisImage,
      qrisName: clean(b.qrisName, 100),
      instructions: typeof b.instructions === 'string' ? b.instructions.replace(/\r/g, '').trim().slice(0, 600) : '',
      uniqueCode: b.uniqueCode !== false,
    },
  };
}

/** Pastikan berkas benar-benar gambar (bukan hanya ekstensinya) dan kembalikan tipe MIME. */
export function sniffImage(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length > 12 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Bukti transfer boleh gambar atau PDF. */
export function sniffProof(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf' | null {
  if (buf.length > 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return sniffImage(buf);
}
