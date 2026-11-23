import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { href } from '../store/router';
import { Logo } from '../components/ui';
import { PLANS } from '../lib/meta';
import { rupiah } from '../lib/format';

const features: [string, string][] = [
  ['Board, List, Kalender, Timeline', 'Lihat proyek yang sama dari lima sudut pandang. Pindah tampilan dalam satu klik.'],
  ['Otomasi tanpa coding', 'Atur aturan "jika status berubah, lakukan ini". Tugas berulang jalan sendiri.'],
  ['Notifikasi lewat WhatsApp', 'Pengingat tenggat dan @mention langsung masuk ke WhatsApp tim.'],
  ['Time tracking', 'Timer per tugas dan timesheet mingguan. Jam billable siap jadi invoice.'],
  ['CRM dan portal klien', 'Kelola pipeline deal dan beri klien halaman untuk memantau progres proyek.'],
  ['Invoice dan QRIS', 'Buat invoice dari proyek, kirim lewat WhatsApp, dan terima pembayaran QRIS.'],
];
const tint = [['#E3F3F0', '#0B5F54'], ['#FDF3DC', '#6B4A00'], ['#E6EFFA', '#1D5FA8']];
const segments: [string, string][] = [
  ['UMKM dan agensi kreatif', 'Board tugas, data klien, dan invoice sederhana dalam satu tempat.'],
  ['Startup dan tim software', 'Backlog, sprint, dan laporan progres untuk tim produk.'],
  ['Kontraktor dan event organizer', 'Timeline, anggaran proyek, dan tim lapangan lewat HP.'],
  ['Organisasi dan kampus', 'Program kerja, pembagian tugas anggota, dan laporan kegiatan.'],
];
const faqs: [string, string][] = [
  ['Apakah benar ada paket gratis?', 'Ya. Paket Gratis bisa dipakai tim sampai 5 orang tanpa batas waktu dan tanpa kartu kredit.'],
  ['Bisa bayar langganan pakai apa?', 'QRIS, transfer bank, dan e-wallet. Invoice resmi dikirim tiap periode tagihan.'],
  ['Apa itu modul bisnis?', 'Fitur tambahan seperti Time Tracking, CRM, Keuangan, dan SDM. Aktifkan hanya yang tim kamu butuhkan.'],
  ['Apakah Rampung bisa dipasang di server sendiri?', 'Bisa, lewat paket Enterprise. Tim kami membantu instalasi dan migrasi data.'],
  ['Bisakah saya pindah paket atau berhenti kapan saja?', 'Bisa. Naik atau turun paket berlaku di periode berikutnya, dan data kamu tetap bisa diekspor.'],
];

const wrap = 'mx-auto w-full max-w-[1180px] px-5 sm:px-8';
const Eyebrow: React.FC<{ children: string }> = ({ children }) => <span className="text-[13px] font-bold tracking-[1px] text-brand">{children}</span>;

export const Landing: React.FC = () => {
  const [yearly, setYearly] = useState(false);
  const price = (m: number | null) => (m === null ? 'Hubungi kami' : m === 0 ? 'Rp0' : rupiah(yearly ? m * 10 : m));
  return (
    <div className="bg-white text-arang">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className={`${wrap} flex h-[68px] items-center justify-between gap-4`}>
          <a href={href.landing}><Logo size={32} /></a>
          <nav aria-label="Navigasi utama" className="hidden gap-7 text-sm font-semibold md:flex">{[['#fitur', 'Fitur'], ['#untuk-siapa', 'Untuk siapa'], ['#harga', 'Harga'], ['#faq', 'FAQ']].map(([h, l]) => <a key={h} href={h} onClick={(e) => { e.preventDefault(); document.querySelector(h)?.scrollIntoView({ behavior: 'smooth' }); }} style={{ color: '#1F2933' }}>{l}</a>)}</nav>
          <div className="flex items-center gap-2"><a href={href.masuk} className="btn btn-ghost hidden sm:inline-flex" style={{ color: '#1F2933' }}>Masuk</a><a href={href.daftar} className="btn btn-primary">Coba gratis</a></div>
        </div>
      </header>

      <section className="bg-canvas">
        <div className={`${wrap} grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1.05fr_1fr]`}>
          <div className="flex flex-col items-start gap-5">
            <span className="rounded-full bg-brand-soft px-3.5 py-1.5 text-[13px] font-bold" style={{ color: '#0B5F54' }}>Aplikasi manajemen proyek berbahasa Indonesia</span>
            <h1 className="m-0 text-[44px] font-extrabold leading-[1.08] tracking-[-1.2px] md:text-[60px]">Dari Ide Sampai <span style={{ color: '#0B7A6B' }}>Rampung.</span></h1>
            <p className="m-0 max-w-[540px] text-lg leading-relaxed text-arang-body">Tugas, proyek, klien, jam kerja, dan invoice tim kamu dalam satu tempat. Tidak perlu lagi lompat antara grup WhatsApp, spreadsheet, dan catatan.</p>
            <div className="flex flex-wrap gap-3"><a href={href.daftar} className="btn btn-primary h-[52px] px-7 text-base">Mulai gratis</a><a href={href.masuk} className="btn btn-outline h-[52px] px-7 text-base">Lihat demo board</a></div>
            <span className="text-[13px] text-arang-muted">Gratis untuk tim sampai 5 orang. Tanpa kartu kredit.</span>
          </div>
          <div aria-hidden="true" className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-white p-5 shadow-[0_24px_60px_-24px_rgba(31,41,51,.25)]">
            <div className="flex items-center justify-between"><span className="text-sm font-extrabold">Peluncuran Website PT Sinar Jaya</span><span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold" style={{ color: '#0B5F54' }}>64%</span></div>
            <div className="grid grid-cols-3 gap-2.5">
              {[['Dikerjakan', '#1D5FA8', ['Desain halaman beranda', 'Setup Laravel dan autentikasi']], ['Review', '#F2B33D', ['Integrasi pembayaran QRIS', 'Logo dan palet warna']], ['Rampung', '#0F9D8A', ['Kickoff meeting klien', 'Kontrak dan timeline']]].map(([n, c, items]) => (
                <div key={n as string} className="flex flex-col gap-2 rounded-xl bg-line-soft p-2.5"><span className="flex items-center gap-1.5 text-xs font-bold"><span className="h-2 w-2 rounded-full" style={{ background: c as string }} />{n as string}</span>{(items as string[]).map((i) => <div key={i} className="rounded-lg border border-line bg-white p-2.5 text-xs font-semibold leading-snug">{i}</div>)}</div>))}
            </div>
            <div className="flex items-center gap-2.5 rounded-xl bg-[#E8F7EC] px-3.5 py-3 text-[13px]" style={{ color: '#14532D' }}><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#25D366]" />WhatsApp: "Integrasi QRIS lewat tenggat"</div>
          </div>
        </div>
      </section>

      <section id="fitur" className="py-20"><div className={`${wrap} flex flex-col gap-10`}>
        <div className="flex max-w-[640px] flex-col gap-3"><Eyebrow>FITUR</Eyebrow><h2 className="m-0 text-4xl font-extrabold tracking-[-0.8px]">Mudah di awal, lengkap saat tim tumbuh.</h2><p className="m-0 text-[17px] text-arang-body">Mulai dari board sederhana. Aktifkan modul bisnis hanya saat dibutuhkan.</p></div>
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
          {features.map(([t, d], i) => <div key={t} className="card flex flex-col gap-3 p-6"><span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-sm font-extrabold" style={{ background: tint[i % 3][0], color: tint[i % 3][1] }}>{String(i + 1).padStart(2, '0')}</span><h3 className="m-0 text-lg font-bold">{t}</h3><p className="m-0 text-[15px] leading-relaxed text-arang-body">{d}</p></div>)}
        </div>
      </div></section>

      <section id="untuk-siapa" className="bg-arang py-20 text-white" style={{ color: '#fff' }}><div className={`${wrap} flex flex-col gap-10`}>
        <div className="flex flex-col gap-3"><span className="text-[13px] font-bold tracking-[1px]" style={{ color: '#F2B33D' }}>UNTUK SIAPA</span><h2 className="m-0 max-w-[640px] text-4xl font-extrabold tracking-[-0.8px]">Dibuat untuk cara kerja tim Indonesia.</h2></div>
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>{segments.map(([n, t]) => <div key={n} className="flex flex-col gap-2 rounded-card border border-white/10 bg-white/5 p-6"><h3 className="m-0 text-lg font-bold">{n}</h3><p className="m-0 text-[15px] leading-relaxed" style={{ color: '#C9D1D6' }}>{t}</p></div>)}</div>
      </div></section>

      <section id="harga" className="py-20"><div className={`${wrap} flex flex-col gap-10`}>
        <div className="flex flex-wrap items-end justify-between gap-5"><div className="flex flex-col gap-3"><Eyebrow>HARGA</Eyebrow><h2 className="m-0 text-4xl font-extrabold tracking-[-0.8px]">Harga rupiah, bayar pakai QRIS.</h2></div>
          <div role="group" aria-label="Periode tagihan" className="inline-flex gap-1 rounded-[10px] bg-canvas-seg p-1 text-sm"><button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)} className="h-10 cursor-pointer rounded-lg border-0 px-4" style={!yearly ? { background: '#fff', fontWeight: 700 } : { background: 'transparent' }}>Bulanan</button><button type="button" aria-pressed={yearly} onClick={() => setYearly(true)} className="h-10 cursor-pointer rounded-lg border-0 px-4" style={yearly ? { background: '#fff', fontWeight: 700 } : { background: 'transparent' }}>Tahunan · hemat 2 bulan</button></div></div>
        <div className="grid items-stretch gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          {PLANS.map((p) => (
            <div key={p.key} className="flex flex-col gap-4 rounded-card bg-white p-6" style={{ border: p.popular ? '2px solid #0B7A6B' : '1px solid #E2E5E1' }}>
              <div className="flex items-center justify-between"><h3 className="m-0 text-lg font-bold">{p.name}</h3>{p.popular && <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold" style={{ color: '#0B5F54' }}>Paling populer</span>}</div>
              <div className="flex flex-col"><span className="text-[28px] font-extrabold">{price(p.monthly)}</span><span className="text-[13px] text-arang-muted">{p.monthly ? (yearly ? 'per pengguna per tahun' : p.unit) : p.unit}</span></div>
              <span className="text-sm text-arang-body">{p.desc}</span>
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">{p.items.map((i) => <li key={i} className="flex gap-2"><Check size={16} color="#0B7A6B" className="mt-0.5 shrink-0" />{i}</li>)}</ul>
              <a href={p.key === 'enterprise' ? '#faq' : href.daftar} className={`btn mt-auto ${p.popular ? 'btn-primary' : 'btn-outline'}`}>{p.cta}</a>
            </div>))}
        </div>
        <span className="text-[13px] text-arang-muted">Harga belum termasuk pajak. Batalkan kapan saja.</span>
      </div></section>

      <section id="faq" className="bg-canvas py-20"><div className={`${wrap} flex max-w-[820px] flex-col gap-6`}>
        <h2 className="m-0 text-4xl font-extrabold tracking-[-0.8px]">Pertanyaan umum</h2>
        <div className="flex flex-col gap-3">{faqs.map(([q, a]) => <details key={q} className="card group p-5"><summary className="cursor-pointer text-base font-bold">{q}</summary><p className="mb-0 mt-3 text-[15px] leading-relaxed text-arang-body">{a}</p></details>)}</div>
      </div></section>

      <section className="bg-brand py-20 text-center text-white" style={{ color: '#fff' }}><div className={`${wrap} flex flex-col items-center gap-5`}>
        <h2 className="m-0 text-4xl font-extrabold tracking-[-0.8px]">Ide tim kamu, kita bikin rampung.</h2><p className="m-0 text-[17px]" style={{ color: '#D7F0EB' }}>Daftar dalam satu menit. Undang tim lewat link atau WhatsApp.</p>
        <a href={href.daftar} className="btn btn-kunyit h-[52px] px-8 text-base">Mulai gratis sekarang</a>
      </div></section>

      <footer className="bg-arang py-12 text-sm" style={{ color: '#C9D1D6' }}><div className={`${wrap} flex flex-col gap-8`}>
        <div className="flex flex-wrap justify-between gap-8"><div className="flex max-w-[320px] flex-col gap-2"><Logo dark /><span>Dari Ide Sampai Rampung. Aplikasi manajemen proyek untuk tim Indonesia.</span></div>
          <div className="flex flex-wrap gap-12">{[['Produk', [['Fitur', '#fitur'], ['Harga', '#harga']]], ['Bantuan', [['FAQ', '#faq'], ['Masuk', href.masuk]]]].map(([t, ls]) => <div key={t as string} className="flex flex-col gap-2"><span className="font-bold text-white">{t as string}</span>{(ls as string[][]).map(([l, h]) => <a key={l} href={h} style={{ color: '#C9D1D6' }}>{l}</a>)}</div>)}</div></div>
        <div className="border-t border-white/10 pt-5 text-[13px]">© 2026 Rampung · rampung.id</div>
      </div></footer>
    </div>
  );
};
