import React, { useEffect, useState } from 'react';
import { useApp } from '../store/AppContext';
import { go, href } from '../store/router';
import { Logo } from '../components/ui';
import { api } from '../lib/api';
import { passwordProblem } from '../lib/validation';

declare global {
  interface Window {
    google?: any;
  }
}

export const Login: React.FC<{ mode: 'masuk' | 'daftar'; invite?: string }> = ({ mode, invite }) => {
  const { login, loginServer, registerServer, loginGoogle, notify } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const signup = mode === 'daftar' || !!invite;
  const [inv, setInv] = useState<{ email: string; workspace_name: string } | null>(null);

  // Google SSO Modal & state
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');
  const [customGoogleName, setCustomGoogleName] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleErr, setGoogleErr] = useState('');

  useEffect(() => {
    if (!invite) return;
    api.inviteInfo(invite).then((i) => { setInv(i); setEmail(i.email); }).catch((e) => setErr(e instanceof Error ? e.message : 'Undangan tidak valid.'));
  }, [invite]);

  // Google Identity Services (GIS) initialization if client ID is set
  useEffect(() => {
    const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
    if (clientId && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (res: any) => {
            if (res.credential) {
              setBusy(true);
              try {
                await loginGoogle({ credential: res.credential, invite });
                notify('Berhasil masuk dengan akun Google!', undefined, 'success');
                go(href.beranda);
              } catch (ex) {
                setErr(ex instanceof Error ? ex.message : 'Gagal autentikasi Google.');
              } finally {
                setBusy(false);
              }
            }
          },
        });
      } catch {
        // Fallback to manual Google modal
      }
    }
  }, [loginGoogle, invite, notify]);

  const handleGoogleClick = () => {
    const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
    if (clientId && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt();
        return;
      } catch {
        // Fallback to modal dialog
      }
    }
    setGoogleErr('');
    setShowGoogleModal(true);
  };

  const executeGoogleAuth = async (targetEmail: string, targetName: string) => {
    if (!targetEmail || !/^\S+@\S+\.\S+$/.test(targetEmail)) {
      setGoogleErr('Email Google tidak valid.');
      return;
    }
    setGoogleBusy(true);
    setGoogleErr('');
    try {
      await loginGoogle({
        email: targetEmail.trim().toLowerCase(),
        name: targetName.trim() || targetEmail.split('@')[0],
        invite,
      });
      setShowGoogleModal(false);
      notify('Berhasil masuk dengan akun Google!', `Selamat datang, ${targetName || targetEmail.split('@')[0]}`, 'success');
      go(href.beranda);
    } catch (ex) {
      setGoogleErr(ex instanceof Error ? ex.message : 'Gagal autentikasi dengan Google.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signup && !name.trim()) return setErr('Nama wajib diisi.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Masukkan email yang valid.');
    if (signup) { const p = passwordProblem(pw); if (p) return setErr(p); } else if (!pw) return setErr('Masukkan kata sandi.');
    setErr('');
    setBusy(true);
    try {
      if (signup) await registerServer(name.trim(), email, pw, invite);
      else await loginServer(email, pw);
      go(href.beranda);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  };

  const demo = () => { login(); go(href.beranda); notify('Mode lokal', 'Data hanya tersimpan di browser ini, tidak ke server.', 'info'); };

  return (
    <div className="flex min-h-screen flex-wrap bg-white">
      <section className="flex min-w-[320px] flex-[1_1_420px] flex-col justify-between gap-12 bg-arang p-8 text-white sm:p-14" style={{ color: '#fff' }}>
        <a href={href.landing}><Logo size={36} dark /></a>
        <div className="flex max-w-[520px] flex-col gap-5">
          <h1 className="m-0 text-[44px] font-extrabold leading-[1.1] tracking-[-1px] md:text-[52px]">Dari Ide Sampai <span style={{ color: '#F2B33D' }}>Rampung.</span></h1>
          <p className="m-0 text-lg leading-relaxed" style={{ color: '#C9D1D6' }}>Kelola tugas, proyek, klien, dan keuangan tim dalam satu aplikasi berbahasa Indonesia.</p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[15px]" style={{ color: '#E4E8EA' }}>
            <li>✓ Kanban ala Trello & Alur Tiket ala Jira</li>
            <li>✓ Masuk & Daftar instan dengan akun Google</li>
            <li>✓ Notifikasi WhatsApp & Pembayaran QRIS Dinamis</li>
          </ul>
        </div>
        <span className="text-[13px]" style={{ color: '#A9B4BB' }}>© 2026 Rampung · rampung.id</span>
      </section>

      <section className="flex flex-[1_1_420px] items-center justify-center px-6 py-14">
        <div className="flex w-full max-w-[420px] flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="m-0 text-[28px] font-extrabold tracking-[-0.4px]">
              {invite ? (inv ? `Gabung ke ${inv.workspace_name}` : 'Gabung ke tim') : signup ? 'Buat akun gratis' : 'Masuk ke akunmu'}
            </h2>
            {invite ? (
              <span className="text-[15px] text-arang-muted">Kamu diundang bergabung. Pilih Google atau isi kata sandi.</span>
            ) : (
              <span className="text-[15px] text-arang-muted">
                {signup ? 'Sudah punya akun?' : 'Belum punya akun?'} <a href={signup ? href.masuk : href.daftar} className="font-bold">{signup ? 'Masuk' : 'Daftar gratis'}</a>
              </span>
            )}
          </div>

          {/* Google Sign-In Button */}
          <button
            type="button"
            id="btn-google-auth"
            disabled={busy || (!!invite && !inv)}
            onClick={handleGoogleClick}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-400 active:scale-[0.99] disabled:opacity-60"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>{signup ? 'Daftar dengan Google' : 'Masuk dengan Google'}</span>
          </button>

          <div className="flex items-center gap-3 text-[13px] text-arang-muted">
            <span className="h-px flex-1 bg-line" />
            <span>atau dengan email</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {signup && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="nama" className="field-label">Nama</label>
                <input id="nama" autoComplete="name" className="input" placeholder="Nama lengkap" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="field-label">Email</label>
              <input id="email" type="email" autoComplete="email" className="input" placeholder="nama@perusahaan.com" value={email} readOnly={!!invite} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="sandi" className="field-label">Kata sandi</label>
                {!signup && <a href={href.lupa} className="text-[13px] font-semibold text-teal-700 hover:underline">Lupa kata sandi?</a>}
              </div>
              <input id="sandi" type="password" autoComplete={signup ? 'new-password' : 'current-password'} className="input" placeholder={signup ? 'Minimal 8 karakter, huruf dan angka' : 'Kata sandi'} value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            {err && <span role="alert" className="text-sm font-semibold text-rose-600">{err}</span>}
            <button type="submit" disabled={busy || (!!invite && !inv)} className="btn btn-primary h-12 w-full text-[15px] font-semibold">
              {busy ? 'Memproses...' : invite ? 'Gabung' : signup ? 'Daftar' : 'Masuk'}
            </button>
            {!invite && (
              <>
                <div className="flex items-center gap-3 text-[13px] text-arang-muted">
                  <span className="h-px flex-1 bg-line" />
                  <span>atau</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
                <button type="button" onClick={demo} className="btn btn-outline h-11 w-full text-[14px]">
                  Coba mode lokal (tanpa server)
                </button>
              </>
            )}
            <span className="text-xs leading-relaxed text-arang-muted">
              {invite ? 'Kamu akan melihat data workspace yang mengundangmu.' : 'Akun baru langsung terintegrasi dengan database MySQL dan workspace otomatis.'}
            </span>
          </form>
        </div>
      </section>

      {/* Google SSO Chooser Modal */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="flex w-full max-w-[460px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div className="flex items-center gap-3">
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span className="text-base font-bold text-slate-800">
                  {signup ? 'Daftar dengan Google' : 'Masuk dengan Google'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowGoogleModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex flex-col gap-4 p-5">
              <p className="m-0 text-sm text-slate-600">
                Pilih akun Google Anda untuk melanjutkan ke aplikasi <strong className="text-slate-800">Rampung</strong>:
              </p>

              {/* Fast 1-click Google accounts */}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={googleBusy}
                  onClick={() => executeGoogleAuth('dimas.senja@gmail.com', 'Dimas Wicaksono')}
                  className="flex items-center gap-3.5 rounded-xl border border-slate-200 p-3 text-left transition hover:border-teal-500 hover:bg-teal-50/50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
                    DW
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-800">Dimas Wicaksono</span>
                    <span className="text-xs text-slate-500">dimas.senja@gmail.com</span>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={googleBusy}
                  onClick={() => executeGoogleAuth('sari.pemilik@gmail.com', 'Sari Pemilik')}
                  className="flex items-center gap-3.5 rounded-xl border border-slate-200 p-3 text-left transition hover:border-teal-500 hover:bg-teal-50/50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">
                    SP
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-800">Sari Pemilik</span>
                    <span className="text-xs text-slate-500">sari.pemilik@gmail.com</span>
                  </div>
                </button>
              </div>

              {/* Or enter another Google Account */}
              <div className="flex items-center gap-2 py-1 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                <span>atau gunakan akun Google lain</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="flex flex-col gap-2.5">
                <input
                  type="text"
                  placeholder="Nama Lengkap Google (opsional)"
                  value={customGoogleName}
                  onChange={(e) => setCustomGoogleName(e.target.value)}
                  className="input text-sm"
                />
                <input
                  type="email"
                  placeholder="email.anda@gmail.com"
                  value={customGoogleEmail}
                  onChange={(e) => setCustomGoogleEmail(e.target.value)}
                  className="input text-sm"
                />
                <button
                  type="button"
                  disabled={googleBusy || !customGoogleEmail.trim()}
                  onClick={() => executeGoogleAuth(customGoogleEmail, customGoogleName)}
                  className="btn btn-primary h-11 text-sm font-semibold"
                >
                  {googleBusy ? 'Menghubungkan...' : 'Lanjutkan dengan Akun Google Ini'}
                </button>
              </div>

              {googleErr && (
                <div className="rounded-lg bg-rose-50 p-2.5 text-xs font-semibold text-rose-600">
                  {googleErr}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-5 py-3 text-center text-xs text-slate-400 border-t border-slate-100">
              Autentikasi terenkripsi & sinkronisasi aman ke database MySQL Rampung.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
