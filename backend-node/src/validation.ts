/** Validasi masukan yang tidak mempercayai tipe/panjang apa pun dari klien. */

export const isStr = (v: unknown): v is string => typeof v === 'string';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** Email bersih (huruf kecil, dipangkas, ≤190 karakter sesuai kolom), atau null jika tidak valid. */
export function parseEmail(v: unknown): string | null {
  if (!isStr(v)) return null;
  const e = v.trim().toLowerCase();
  return e.length <= 190 && EMAIL_RE.test(e) ? e : null;
}

/** Nama bersih 1–100 karakter, atau null. */
export function parseName(v: unknown): string | null {
  if (!isStr(v)) return null;
  const n = v.trim();
  return n.length >= 1 && n.length <= 100 ? n : null;
}

/** ID numerik positif (maks 18 digit agar muat di BigInt MySQL), atau null untuk "abc", "-1", "0", "1e3", dst. */
export function parseId(v: unknown): bigint | null {
  const s = String(v ?? '');
  if (!/^[1-9]\d{0,17}$/.test(s)) return null;
  return BigInt(s);
}
