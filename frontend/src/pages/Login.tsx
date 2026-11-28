import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import { go, href } from '../store/router';
import { Logo } from '../components/ui';
import { limitText, planOf, usePlanCatalog } from '../lib/plans';
import { api } from '../lib/api';
import { passwordProblem } from '../lib/validation';

interface GoogleIdentity {
  initialize: (config: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
  prompt: () => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

export const Login: React.FC<{ mode: 'masuk' | 'daftar'; invite?: string }> = ({ mode, invite }) => {
  const { loginServer, registerServer, loginGoogle, notify } = useApp();
  const catalog = usePlanCatalog();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const signup = mode === 'daftar' || !!invite;
  const [inv, setInv] = useState<{ email: string; workspace_name: string } | null>(null);

  // Google OAuth 2.0 Client ID state
  const DEFAULT_GOOGLE_CLIENT_ID = '995698868481-o9re5ai2jm1ccnnamri95c3s68hdctmh.apps.googleusercontent.com';
  const [clientId, setClientId] = useState<string>(() => {
    return (
      import.meta.env.VITE_GOOGLE_CLIENT_ID ||
      localStorage.getItem('rampung_google_client_id') ||
      DEFAULT_GOOGLE_CLIENT_ID
    );
  });
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [inputClientId, setInputClientId] = useState('');
  const [gisLoaded, setGisLoaded] = useState(false);

  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!invite) return;
    api.inviteInfo(invite).then((i) => {
      setInv(i);
      setEmail(i.email);
    }).catch((e) => setErr(e instanceof Error ? e.message : 'Undangan tidak valid.'));
  }, [invite]);

  // Check if Google Identity Services script is available
  useEffect(() => {
    if (window.google?.accounts?.id) {
      setGisLoaded(true);
      return;
    }
    const interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        setGisLoaded(true);
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Initialize official Google Identity Services (GIS)
  useEffect(() => {
    if (!clientId.trim() || !window.google?.accounts?.id) return;

    try {
      window.google.accounts.id.initialize({
        client_id: clientId.trim(),
        callback: async (res: { credential?: string }) => {
          if (res.credential) {
            setBusy(true);
            setErr('');
            try {
              const u = await loginGoogle({ credential: res.credential, invite });
              notify('Berhasil masuk dengan akun Google!', undefined, 'success');
              go(u.is_superadmin ? href.admin() : href.beranda);
            } catch (ex) {
              setErr(ex instanceof Error ? ex.message : 'Gagal autentikasi Google.');
            } finally {
              setBusy(false);
            }
          }
        },
      });

      if (googleBtnRef.current) {
        googleBtnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          width: Math.max(200, Math.min(400, Math.floor(googleBtnRef.current.getBoundingClientRect().width) || 360)),
          text: signup ? 'signup_with' : 'signin_with',
          shape: 'pill',
          logo_alignment: 'left',
        });
      }

      // Optional One Tap prompt
      try {
        window.google.accounts.id.prompt();
      } catch {
        // One tap may be throttled
      }
    } catch (e) {
      console.error('Inisialisasi Google GIS gagal:', e);
    }
  }, [clientId, gisLoaded, signup, invite, loginGoogle, notify]);

  const handleManualGoogleClick = () => {
    if (!clientId.trim()) {
      setInputClientId('');
      setShowConfigModal(true);
    }
  };

  const handleSaveClientId = () => {
    const val = inputClientId.trim();
    if (!val) {
      setErr('Masukkan Google Client ID yang valid.');
      return;
    }
    localStorage.setItem('rampung_google_client_id', val);
    setClientId(val);
    setShowConfigModal(false);
    notify('Google Client ID tersimpan', 'Tombol login Google resmi telah diaktifkan.', 'success');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signup && !name.trim()) return setErr('Nama wajib diisi.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Masukkan email yang valid.');
    if (signup) {
      const p = passwordProblem(pw);
      if (p) return setErr(p);
    } else if (!pw) {
      return setErr('Masukkan kata sandi.');
    }
    setErr('');
    setBusy(true);
    try {
      const u = signup ? await registerServer(name.trim(), email, pw, invite) : await loginServer(email, pw);
      // Superadmin langsung ke panelnya; pengguna lain ke workspace.
      go(u.is_superadmin ? href.admin() : href.beranda);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="flex min-h-screen bg-[#FAFBF9]">
      {/* ── Panel merek (desktop) ── */}
      <section className="relative hidden w-[46%] max-w-[760px] flex-col justify-between overflow-hidden bg-[#0E171C] p-12 text-white lg:flex xl:p-16" style={{ color: '#fff' }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-[#0F9D8A] opacity-25 blur-[140px]" />
          <div className="absolute -bottom-40 -right-24 h-[420px] w-[420px] rounded-full bg-[#F2B33D] opacity-[0.14] blur-[140px]" />
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
        </div>

        <a href={href.landing} className="relative w-fit" aria-label="Rampung — halaman depan"><Logo size={30} dark /></a>

        <div className="relative flex flex-col gap-8">
          <div className="flex flex-col gap-5">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12.5px] font-medium" style={{ color: '#D7F0EB' }}><span className="h-1.5 w-1.5 rounded-full bg-[#F2B33D]" />Manajemen proyek berbahasa Indonesia</span>
            <h1 className="m-0 text-[44px] font-extrabold leading-[1.05] tracking-[-0.035em] xl:text-[54px]">
              Dari ide sampai <span className="bg-gradient-to-r from-[#5EE0C9] via-[#2BC4A9] to-[#F2B33D] bg-clip-text text-transparent">rampung.</span>
            </h1>
            <p className="m-0 max-w-[460px] text-[16.5px] leading-relaxed" style={{ color: '#B9C4CA' }}>Tiket, linimasa, klien, jam kerja, dan invoice tim Anda — rapi dalam satu tempat.</p>
          </div>

          {/* Ilustrasi produk */}
          <div aria-hidden="true" className="relative max-w-[440px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11.5px]" style={{ color: '#9FB0B8' }}>
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] bg-[#0F9D8A] text-[8px] font-black text-white">✓</span>RKS-2 · Rebranding Kopi Senja
                <span className="ml-auto rounded-[4px] bg-[#1D5FA8]/25 px-1.5 py-0.5 text-[10px] font-bold" style={{ color: '#9CC2F0' }}>DIKERJAKAN</span>
              </div>
              <div className="mt-2 text-[15px] font-semibold">Desain logo utama dan variasi monokrom</div>
              <div className="mt-3 h-1.5 rounded-full bg-white/10"><div className="h-1.5 w-2/3 rounded-full bg-gradient-to-r from-[#0F9D8A] to-[#5EE0C9]" /></div>
              <div className="mt-3 flex items-center justify-between text-[11.5px]" style={{ color: '#9FB0B8' }}>
                <span>2 dari 3 subtask · tenggat 26 Nov</span>
                <span className="flex">{['#0F9D8A', '#B4530B', '#1D5FA8'].map((c, i) => <span key={c} className="h-6 w-6 rounded-full border-2 border-[#16242B]" style={{ background: c, marginLeft: i ? -7 : 0 }} />)}</span>
              </div>
            </div>
            <div className="absolute -bottom-5 right-[-18px] flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#16242B] px-3.5 py-2.5 text-[12px] shadow-[0_20px_50px_-15px_rgba(0,0,0,.7)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F2B33D] text-[10px] font-black" style={{ color: '#2A1D00' }}>SN</span>
              <span><b>Sari</b> memindahkan RKS-4 ke <b style={{ color: '#F2B33D' }}>Review</b></span>
            </div>
          </div>

          <ul className="m-0 mt-4 grid list-none gap-3 p-0 text-[14.5px]" style={{ color: '#D9E1E4' }}>
            {['Papan, daftar, kalender, dan linimasa dari data yang sama', 'Klien, keuangan, dan jam kerja dalam modul bisnis', 'Harga rupiah, bayar lewat QRIS atau transfer'].map((t) => (
              <li key={t} className="flex items-center gap-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0F9D8A]/20 text-[11px] font-black" style={{ color: '#5EE0C9' }}>✓</span>{t}</li>
            ))}
          </ul>
        </div>

        <span className="relative text-[13px]" style={{ color: '#7F9099' }}>© 2026 Rampung · rampung.id</span>
      </section>

      {/* ── Formulir ── */}
      <section className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-6 py-5 sm:px-10">
          <a href={href.landing} className="lg:hidden" aria-label="Rampung — halaman depan"><Logo size={26} /></a>
          <a href={href.landing} className="ml-auto text-[13.5px] font-semibold" style={{ color: '#5B6670' }}>← Kembali ke beranda</a>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 pb-14 sm:px-8">
          <div className="w-full max-w-[440px] rounded-2xl border border-line bg-white p-7 shadow-pop sm:p-10">
            <div className="mb-7 flex flex-col gap-2">
              <h2 className="m-0 text-[28px] font-extrabold tracking-[-0.03em]">
                {invite ? (inv ? `Gabung ke ${inv.workspace_name}` : 'Gabung ke tim') : signup ? 'Buat akun Rampung' : 'Selamat datang kembali'}
              </h2>
              {invite ? (
                <span className="text-[15px] text-arang-muted">Anda diundang bergabung. Pilih Google atau buat kata sandi.</span>
              ) : (
                <span className="text-[15px] text-arang-muted">
                  {signup ? `Gratis untuk tim sampai ${limitText(planOf(catalog, 'gratis')?.limits.members ?? null)} orang. Sudah punya akun?` : 'Masuk untuk melanjutkan pekerjaan tim. Belum punya akun?'}{' '}
                  <a href={signup ? href.masuk : href.daftar} className="font-bold">{signup ? 'Masuk' : 'Daftar gratis'}</a>
                </span>
              )}
            </div>

            {/* Google Identity Services resmi */}
            <div className="flex flex-col items-center">
              {clientId.trim() ? (
                <div ref={googleBtnRef} className="flex min-h-[44px] w-full justify-center" />
              ) : (
                <button
                  type="button"
                  id="btn-google-auth-trigger"
                  disabled={busy || (!!invite && !inv)}
                  onClick={handleManualGoogleClick}
                  className="flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-line-strong bg-white px-4 text-[14.5px] font-semibold text-arang shadow-xs transition hover:border-arang-mist hover:bg-canvas-subtle"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>{signup ? 'Daftar dengan Google' : 'Masuk dengan Google'}</span>
                </button>
              )}
            </div>

            <div className="my-6 flex items-center gap-3 text-[12.5px] text-arang-muted">
              <span className="h-px flex-1 bg-line" />
              <span>atau dengan email</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              {signup && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="nama" className="field-label">Nama lengkap</label>
                  <input id="nama" autoComplete="name" className="input h-11" placeholder="Nama Anda" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="field-label">Email kerja</label>
                <input id="email" type="email" autoComplete="email" className="input h-11" placeholder="nama@perusahaan.com" value={email} readOnly={!!invite} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="sandi" className="field-label">Kata sandi</label>
                  {!signup && <a href={href.lupa} className="text-[13px] font-semibold">Lupa kata sandi?</a>}
                </div>
                <input id="sandi" type="password" autoComplete={signup ? 'new-password' : 'current-password'} className="input h-11" placeholder={signup ? 'Minimal 8 karakter, huruf dan angka' : '••••••••'} value={pw} onChange={(e) => setPw(e.target.value)} />
              </div>
              {err && <span role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13.5px] font-semibold text-danger">{err}</span>}
              <button type="submit" disabled={busy || (!!invite && !inv)} className="btn btn-primary mt-1 h-11 w-full text-[15px]">
                {busy ? 'Memproses…' : invite ? 'Gabung ke tim' : signup ? 'Buat akun' : 'Masuk'}
              </button>
            </form>

            <p className="m-0 mt-6 text-center text-[12.5px] leading-relaxed text-arang-muted">
              {invite ? 'Anda akan masuk ke workspace yang mengundang Anda.' : signup ? 'Workspace Anda dibuat otomatis setelah mendaftar.' : 'Data workspace Anda tersimpan di server dan tersinkron di semua perangkat.'}
            </p>
          </div>
        </div>
      </section>

      {/* Google OAuth Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="flex w-full max-w-[500px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div className="flex items-center gap-3">
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <h3 className="m-0 text-base font-bold text-slate-800">
                  Konfigurasi Google Sign-In Resmi
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-4 p-5 text-sm text-slate-600 leading-relaxed">
              <p className="m-0">
                Untuk menghubungkan autentikasi Google sungguhan (membuka jendela popup asli dari <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-mono text-slate-800">accounts.google.com</code>), Google mewajibkan <strong>OAuth 2.0 Client ID</strong> dari Google Cloud Console.
              </p>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="cfg-client-id" className="font-semibold text-slate-800">
                  Google Client ID (Web Application)
                </label>
                <input
                  id="cfg-client-id"
                  type="text"
                  placeholder="Contoh: 123456789-abcdef.apps.googleusercontent.com"
                  value={inputClientId}
                  onChange={(e) => setInputClientId(e.target.value)}
                  className="input text-sm"
                />
              </div>

              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 text-xs flex flex-col gap-2">
                <strong className="text-slate-800">3 Langkah Singkat Google Cloud Console:</strong>
                <ol className="m-0 pl-4 flex flex-col gap-1 text-slate-600">
                  <li>Buka <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-teal-700 font-semibold underline">Google Cloud Console &gt; Credentials</a>.</li>
                  <li>Klik <strong>Create Credentials &gt; OAuth client ID</strong> (Pilih: <em>Web application</em>).</li>
                  <li>Pada <strong>Authorized JavaScript origins</strong>, tambahkan: <code className="bg-white border rounded px-1 text-slate-800 font-mono">http://localhost:3000</code> dan <code className="bg-white border rounded px-1 text-slate-800 font-mono">http://127.0.0.1:3000</code>.</li>
                  <li>Salin <strong>Client ID</strong> dan tempel di kotak atas.</li>
                </ol>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="btn btn-outline h-10 px-4 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveClientId}
                  className="btn btn-primary h-10 px-5 text-xs font-semibold"
                >
                  Simpan & Aktifkan Google Asli
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
