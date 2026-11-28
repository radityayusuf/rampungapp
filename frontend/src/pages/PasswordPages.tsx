import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { go, href } from '../store/router';
import { Logo } from '../components/ui';
import { api } from '../lib/api';
import { passwordProblem } from '../lib/validation';

const Shell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12">
    <div className="flex w-full max-w-[420px] flex-col gap-6">
      <a href={href.landing} className="self-center" aria-label="Rampung — halaman depan"><Logo size={30} /></a>
      <div className="card flex flex-col gap-5 p-7">
        <h1 className="m-0 text-2xl font-extrabold tracking-[-0.4px]">{title}</h1>
        {children}
      </div>
      <a href={href.masuk} className="self-center text-sm font-semibold">Kembali ke halaman masuk</a>
    </div>
  </div>
);

export const ForgotPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Masukkan email yang valid.');
    setBusy(true);
    setErr('');
    try {
      await api.forgot(email.trim());
      setSent(true);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Lupa kata sandi">
      {sent ? (
        <p role="status" className="m-0 text-[15px] leading-relaxed text-arang-body">Jika <strong>{email}</strong> terdaftar, tautan untuk mengatur ulang kata sandi sudah dikirim. Tautan berlaku 60 menit.</p>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className="m-0 text-sm text-arang-muted">Masukkan email akun Anda. Kami akan mengirim tautan untuk membuat kata sandi baru.</p>
          <div className="flex flex-col gap-2"><label htmlFor="f-email" className="field-label">Email</label><input id="f-email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {err && <span role="alert" className="text-sm font-semibold" style={{ color: '#B42318' }}>{err}</span>}
          <button type="submit" disabled={busy} className="btn btn-primary h-12">{busy ? 'Mengirim...' : 'Kirim tautan'}</button>
        </form>
      )}
    </Shell>
  );
};

export const ResetPage: React.FC<{ token: string; email: string }> = ({ token, email }) => {
  const { resetPassword } = useApp();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(pw);
    if (problem) return setErr(problem);
    if (pw !== pw2) return setErr('Konfirmasi kata sandi tidak sama.');
    setBusy(true);
    setErr('');
    try {
      await resetPassword(email, token, pw);
      go(href.beranda);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Buat kata sandi baru">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="m-0 text-sm text-arang-muted">Untuk akun <strong>{email}</strong>. Semua perangkat lain akan dikeluarkan.</p>
        <div className="flex flex-col gap-2"><label htmlFor="r-pw" className="field-label">Kata sandi baru</label><input id="r-pw" type="password" autoComplete="new-password" className="input" placeholder="Minimal 8 karakter, huruf dan angka" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div className="flex flex-col gap-2"><label htmlFor="r-pw2" className="field-label">Ulangi kata sandi</label><input id="r-pw2" type="password" autoComplete="new-password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        {err && <span role="alert" className="text-sm font-semibold" style={{ color: '#B42318' }}>{err}</span>}
        <button type="submit" disabled={busy} className="btn btn-primary h-12">{busy ? 'Menyimpan...' : 'Simpan dan masuk'}</button>
      </form>
    </Shell>
  );
};
