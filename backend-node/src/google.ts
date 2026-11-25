export type GoogleResult =
  | { ok: true; email: string; name: string }
  | { ok: false; status: number; message: string };

const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

/**
 * Verifikasi ID token Google. Tanda tangan diperiksa oleh endpoint tokeninfo milik Google;
 * di sini kita memastikan token ditujukan untuk aplikasi ini (aud), diterbitkan Google (iss),
 * belum kedaluwarsa, dan emailnya sudah diverifikasi Google.
 * Tidak ada fallback: jika Google tidak bisa dijangkau, login ditolak.
 */
export async function verifyGoogleCredential(credential: string): Promise<GoogleResult> {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!clientId) {
    return { ok: false, status: 503, message: 'Login Google belum dikonfigurasi di server.' };
  }

  let info: Record<string, string>;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { ok: false, status: 401, message: 'Kredensial Google tidak valid atau kedaluwarsa.' };
    }
    info = (await res.json()) as Record<string, string>;
  } catch {
    return { ok: false, status: 503, message: 'Server Google tidak dapat dijangkau. Coba lagi sebentar.' };
  }

  const verified = String(info.email_verified) === 'true';
  const notExpired = Number(info.exp) * 1000 > Date.now();
  if (info.aud !== clientId || !ISSUERS.includes(info.iss) || !verified || !notExpired || !info.email) {
    return { ok: false, status: 401, message: 'Kredensial Google tidak valid.' };
  }

  return { ok: true, email: info.email, name: info.name || info.email.split('@')[0] };
}
