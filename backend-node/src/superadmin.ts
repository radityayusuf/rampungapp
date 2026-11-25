/**
 * Superadmin ditentukan oleh role "superadmin" di database, atau (untuk bootstrap awal)
 * oleh daftar SUPERADMIN_EMAILS di environment, dengan syarat emailnya SUDAH terverifikasi
 * (lewat Google). Email yang hanya didaftarkan dengan kata sandi tidak pernah cukup.
 */
export function isSuperadminUser(u: { role: string; email: string; email_verified_at: Date | null } | undefined | null): boolean {
  if (!u) return false;
  if (u.role === 'superadmin') return true;
  const list = (process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!u.email_verified_at && list.includes(u.email.toLowerCase());
}
