import React, { useEffect, useState } from 'react';
import { useApp } from '../store/AppContext';
import { go, href } from '../store/router';
import { Logo } from '../components/ui';
import { api } from '../lib/api';
import { passwordProblem } from '../lib/validation';

export const Login: React.FC<{ mode: 'masuk' | 'daftar'; invite?: string }> = ({ mode, invite }) => {
  const { login, loginServer, registerServer, notify } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const signup = mode === 'daftar' || !!invite;
  const [inv, setInv] = useState<{ email: string; workspace_name: string } | null>(null);

  useEffect(() => {
    if (!invite) return;
    api.inviteInfo(invite).then((i) => { setInv(i); setEmail(i.email); }).catch((e) => setErr(e instanceof Error ? e.message : 'Undangan tidak valid.'));
  }, [invite]);

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
          <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[15px]" style={{ color: '#E4E8EA' }}><li>✓ Kanban, List, Kalender, dan Timeline</li><li>✓ Notifikasi lewat WhatsApp</li><li>✓ Bayar langganan pakai QRIS</li></ul>
        </div>
        <span className="text-[13px]" style={{ color: '#A9B4BB' }}>© 2026 Rampung · rampung.id</span>
      </section>

      <section className="flex flex-[1_1_420px] items-center justify-center px-6 py-14">
        <form onSubmit={submit} noValidate className="flex w-full max-w-[400px] flex-col gap-5">
          <div className="flex flex-col gap-1.5"><h2 className="m-0 text-[28px] font-extrabold tracking-[-0.4px]">{invite ? (inv ? `Gabung ke ${inv.workspace_name}` : 'Gabung ke tim') : signup ? 'Buat akun gratis' : 'Masuk ke akunmu'}</h2>
            {invite ? <span className="text-[15px] text-arang-muted">Kamu diundang bergabung. Buat kata sandi untuk melanjutkan.</span> : <span className="text-[15px] text-arang-muted">{signup ? 'Sudah punya akun?' : 'Belum punya akun?'} <a href={signup ? href.masuk : href.daftar} className="font-bold">{signup ? 'Masuk' : 'Daftar gratis'}</a></span>}</div>
          {signup && <div className="flex flex-col gap-2"><label htmlFor="nama" className="field-label">Nama</label><input id="nama" autoComplete="name" className="input" placeholder="Nama lengkap" value={name} onChange={(e) => setName(e.target.value)} /></div>}
          <div className="flex flex-col gap-2"><label htmlFor="email" className="field-label">Email</label><input id="email" type="email" autoComplete="email" className="input" placeholder="nama@perusahaan.com" value={email} readOnly={!!invite} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="flex flex-col gap-2"><div className="flex items-center justify-between"><label htmlFor="sandi" className="field-label">Kata sandi</label>{!signup && <a href={href.lupa} className="text-[13px] font-semibold">Lupa kata sandi?</a>}</div><input id="sandi" type="password" autoComplete={signup ? 'new-password' : 'current-password'} className="input" placeholder={signup ? 'Minimal 8 karakter, huruf dan angka' : 'Kata sandi'} value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          {err && <span role="alert" className="text-sm font-semibold" style={{ color: '#B42318' }}>{err}</span>}
          <button type="submit" disabled={busy || (!!invite && !inv)} className="btn btn-primary h-12 w-full text-[15px]">{busy ? 'Memproses...' : invite ? 'Gabung' : signup ? 'Daftar' : 'Masuk'}</button>
          {!invite && <>
            <div className="flex items-center gap-3 text-[13px] text-arang-muted"><span className="h-px flex-1 bg-line" />atau<span className="h-px flex-1 bg-line" /></div>
            <button type="button" onClick={demo} className="btn btn-outline h-12 w-full">Coba mode lokal (tanpa server)</button>
          </>}
          <span className="text-xs leading-relaxed text-arang-muted">{invite ? 'Kamu akan melihat data workspace yang mengundangmu.' : 'Akun baru langsung berisi data contoh Studio Nusa supaya semua fitur bisa dicoba.'}  Mode lokal menyimpan data di browser ini saja.</span>
        </form>
      </section>
    </div>
  );
};
