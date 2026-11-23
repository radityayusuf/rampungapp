/** Aturan kata sandi, sama dengan backend: minimal 8 karakter, mengandung huruf dan angka. */
export const passwordProblem = (pw: string): string | null => {
  if (pw.length < 8) return 'Kata sandi minimal 8 karakter.';
  if (!/[A-Za-z]/.test(pw)) return 'Kata sandi harus mengandung huruf.';
  if (!/[0-9]/.test(pw)) return 'Kata sandi harus mengandung angka.';
  return null;
};

export const isEmail = (s: string) => /^\S+@\S+\.\S+$/.test(s.trim());
