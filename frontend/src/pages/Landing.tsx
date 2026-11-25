import React, { useState } from 'react';
import {
  ArrowRight, BarChart3, Bell, Briefcase, Check, ChevronDown, Clock, Columns3, FileText, GitBranch, LayoutList, MessageCircle,
  Receipt, Search, ShieldCheck, Sparkles, Users, Wallet, Zap, ChartNoAxesGantt,
} from 'lucide-react';
import { href } from '../store/router';
import { Logo } from '../components/ui';
import { gbText, limitText, planOf, usePlanCatalog, yearlySaving } from '../lib/plans';
import { rupiah } from '../lib/format';

/* ───────────────── Konten (jujur: hanya fitur yang benar-benar ada) ───────────────── */

const pillars: { icon: React.ReactNode; title: string; text: string }[] = [
  { icon: <Columns3 size={20} />, title: 'Rencanakan', text: 'Pecah ide menjadi tugas, subtask, dan tenggat yang jelas untuk setiap orang.' },
  { icon: <GitBranch size={20} />, title: 'Lacak', text: 'Papan, daftar, kalender, dan linimasa dari data yang sama — selalu sinkron.' },
  { icon: <MessageCircle size={20} />, title: 'Kolaborasi', text: 'Komentar, @mention, lampiran, dan notifikasi tanpa grup chat yang berantakan.' },
  { icon: <BarChart3 size={20} />, title: 'Laporkan', text: 'Dasbor, burndown, beban kerja tim, dan ekspor CSV untuk rapat mingguan.' },
];

const modules: { icon: React.ReactNode; title: string; text: string }[] = [
  { icon: <Users size={18} />, title: 'CRM & portal klien', text: 'Pipeline deal, data klien, dan halaman progres yang bisa dibuka klien.' },
  { icon: <Wallet size={18} />, title: 'Keuangan proyek', text: 'Anggaran, pengeluaran, dan invoice per proyek dengan status pelunasan.' },
  { icon: <Clock size={18} />, title: 'Time tracking', text: 'Timer per tugas dan rekap jam kerja tim dibanding estimasi.' },
  { icon: <Briefcase size={18} />, title: 'SDM', text: 'Absensi harian, pengajuan cuti, dan kapasitas kerja anggota.' },
  { icon: <Zap size={18} />, title: 'Otomasi & WhatsApp', text: 'Aturan jika–maka saat status berubah, termasuk kabar ke klien lewat WhatsApp.' },
  { icon: <Sparkles size={18} />, title: 'Asisten AI', text: 'Pecah satu ide besar menjadi daftar tugas dan ringkas kesehatan proyek.' },
];

const audiences: [string, string][] = [
  ['Agensi & studio kreatif', 'Satu papan untuk setiap klien, invoice dari proyek, dan portal agar klien tidak perlu bertanya progres.'],
  ['Tim produk & software', 'Kunci tiket berurutan, dependensi antar tugas, linimasa, dan burndown untuk setiap rilis.'],
  ['Kontraktor & event organizer', 'Linimasa pekerjaan, anggaran proyek, dan tim lapangan yang bekerja dari ponsel.'],
  ['Organisasi & kampus', 'Program kerja, pembagian tugas anggota, dan laporan kegiatan yang rapi.'],
];

const faqsFor = (free?: { members: number | null; activeProjects: number | null; storageGb: number | null }): [string, string][] => [
  ['Apakah benar ada paket gratis?', `Ya. Paket Gratis bisa dipakai tim sampai ${limitText(free?.members ?? null)} orang dengan ${limitText(free?.activeProjects ?? null)} proyek aktif dan penyimpanan ${gbText(free?.storageGb ?? null)}, tanpa batas waktu dan tanpa kartu kredit.`],
  ['Bagaimana cara membayar langganan?', 'Lewat QRIS atau transfer rekening. Setelah Anda mengunggah bukti pembayaran, administrator memverifikasi dan paket langsung aktif.'],
  ['Apakah langganan diperpanjang otomatis?', 'Tidak. Paket berlaku sesuai periode yang dibayar. Jika tidak diperpanjang, workspace kembali ke paket Gratis dan data Anda tetap aman.'],
  ['Apa itu modul bisnis?', 'Fitur tambahan seperti CRM, Keuangan, Time Tracking, dan SDM. Aktifkan hanya modul yang dibutuhkan tim Anda.'],
  ['Bisakah data diekspor?', 'Bisa. Daftar tugas, dasbor, dan laporan dapat diekspor ke CSV kapan saja.'],
];

const wrap = 'mx-auto w-full max-w-[1200px] px-5 sm:px-8';
const scrollTo = (e: React.MouseEvent, id: string) => { e.preventDefault(); document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' }); };

const Eyebrow: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({ children, dark }) => (
  <span className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: dark ? '#F2B33D' : '#0B7A6B' }}>
    <span className="h-px w-6" style={{ background: dark ? '#F2B33D' : '#0F9D8A' }} />{children}
  </span>
);

/* ───────────────── Ilustrasi produk (HTML murni, dekoratif) ───────────────── */

const Av: React.FC<{ c: string; t: string }> = ({ c, t }) => <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white" style={{ background: c }}>{t}</span>;
const Prio: React.FC<{ p: 'h' | 'm' | 'l' }> = ({ p }) => <span className="text-[11px] font-black" style={{ color: p === 'h' ? '#C2362B' : p === 'm' ? '#D98A0B' : '#2F6FB8' }}>{p === 'h' ? '↑' : p === 'm' ? '=' : '↓'}</span>;
const MiniCard: React.FC<{ title: string; k: string; label: [string, string, string]; p: 'h' | 'm' | 'l'; av: [string, string]; bar?: number }> = ({ title, k, label, p, av, bar }) => (
  <div className="flex flex-col gap-1.5 rounded-md border border-[#E2E5E1] bg-white p-2 shadow-[0_1px_2px_rgba(16,24,40,.06)]">
    <span className="text-[10.5px] font-medium leading-snug text-[#1F2933]">{title}</span>
    <span className="w-fit rounded px-1 text-[9px] font-semibold" style={{ background: label[1], color: label[2] }}>{label[0]}</span>
    {bar !== undefined && <span className="h-[3px] rounded-full bg-[#ECEEEA]"><span className="block h-[3px] rounded-full bg-[#0F9D8A]" style={{ width: `${bar}%` }} /></span>}
    <span className="flex items-center justify-between">
      <span className="flex items-center gap-1"><span className="inline-flex h-3 w-3 items-center justify-center rounded-[3px] bg-[#0F9D8A] text-[7px] font-black text-white">✓</span><span className="text-[9.5px] font-semibold text-[#5B6670]">{k}</span></span>
      <span className="flex items-center gap-1"><Prio p={p} /><Av c={av[0]} t={av[1]} /></span>
    </span>
  </div>
);

const L: Record<'desain' | 'dev' | 'konten' | 'riset', [string, string, string]> = { desain: ['Desain', '#F0EBFB', '#5B3AA8'], dev: ['Pengembangan', '#E6EFFA', '#1D5FA8'], konten: ['Konten', '#FDF3DC', '#6B4A00'], riset: ['Riset', '#E3F3F0', '#0B5F54'] };

const AppMock: React.FC = () => (
  <div aria-hidden="true" className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_40px_120px_-30px_rgba(15,157,138,.45),0_20px_60px_-20px_rgba(0,0,0,.6)]">
    <div className="flex items-center gap-1.5 border-b border-[#ECEEEA] bg-[#F7F8F6] px-3 py-2">
      <span className="h-2.5 w-2.5 rounded-full bg-[#F87171]" /><span className="h-2.5 w-2.5 rounded-full bg-[#FBBF24]" /><span className="h-2.5 w-2.5 rounded-full bg-[#34D399]" />
      <span className="mx-auto hidden rounded-md bg-white px-10 py-0.5 text-[9.5px] text-[#8A949B] sm:block">rampung.id/proyek/website-batik-lestari</span>
    </div>
    <div className="flex items-center gap-3 border-b border-[#E2E5E1] px-3 py-2">
      <Logo size={16} />
      <span className="hidden gap-3 text-[10px] font-semibold text-[#3D4750] sm:flex"><span>Pekerjaan Saya</span><span className="rounded bg-[#E3F3F0] px-1.5 text-[#0B5F54]">Proyek</span><span>Dasbor</span></span>
      <span className="rounded bg-[#0B7A6B] px-2 py-0.5 text-[9.5px] font-bold text-white">+ Buat</span>
      <span className="ml-auto hidden items-center gap-1 rounded border border-[#E2E5E1] bg-[#F5F6F4] px-2 py-0.5 text-[9.5px] text-[#8A949B] md:flex"><Search size={9} />Cari apa saja…</span>
      <Bell size={11} className="text-[#5B6670]" /><Av c="#B4530B" t="SN" />
    </div>
    <div className="flex">
      <div className="hidden w-[132px] shrink-0 flex-col gap-0.5 border-r border-[#E2E5E1] bg-[#FAFBF9] p-2 text-[10px] text-[#3D4750] md:flex">
        <span className="mb-1 flex items-center gap-1.5 px-1"><span className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-[#0F9D8A] to-[#0B5F54] text-[9px] font-black text-white">W</span><span className="font-bold leading-tight">Website Batik<br /><span className="font-normal text-[#8A949B]">Proyek · WBL</span></span></span>
        {[['Papan', true], ['Daftar'], ['Kalender'], ['Linimasa'], ['Tabel'], ['Dokumen']].map(([n, a]) => <span key={n as string} className={`rounded px-1.5 py-1 ${a ? 'bg-[#E3F3F0] font-bold text-[#0B5F54]' : ''}`}>{n as string}</span>)}
      </div>
      <div className="min-w-0 flex-1 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <div><div className="text-[9px] text-[#8A949B]">Proyek / Website Batik Lestari</div><div className="text-[13px] font-bold text-[#1F2933]">Papan · Website Batik Lestari</div></div>
          <span className="hidden gap-1 sm:flex">{['#0F9D8A', '#1D5FA8', '#B4530B'].map((c, i) => <span key={c} style={{ marginLeft: i ? -6 : 0 }} className="h-5 w-5 rounded-full border-2 border-white" ><span className="block h-full w-full rounded-full" style={{ background: c }} /></span>)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            ['IDE', [<MiniCard key="a" title="Uji pembayaran & pengiriman" k="WBL-4" label={L.dev} p="h" av={['#1D5FA8', 'AR']} />, <MiniCard key="b" title="Halaman tentang kami" k="WBL-7" label={L.konten} p="l" av={['#B4530B', 'SN']} />]],
            ['DIKERJAKAN', [<MiniCard key="c" title="Integrasi keranjang dan checkout" k="WBL-2" label={L.dev} p="h" av={['#0F9D8A', 'DM']} bar={60} />, <MiniCard key="d" title="Optimasi gambar katalog" k="WBL-5" label={L.dev} p="m" av={['#1D5FA8', 'AR']} />]],
            ['REVIEW', [<MiniCard key="e" title="Foto produk 40 motif batik" k="WBL-3" label={L.konten} p="m" av={['#B4530B', 'SN']} />]],
            ['RAMPUNG', [<MiniCard key="f" title="Wireframe beranda & katalog" k="WBL-1" label={L.desain} p="m" av={['#0F9D8A', 'DM']} bar={100} />, <MiniCard key="g" title="Riset pesaing toko online" k="WBL-6" label={L.riset} p="l" av={['#1D5FA8', 'AR']} />]],
          ].map(([title, cards]) => (
            <div key={title as string} className={`flex flex-col gap-1.5 rounded-lg bg-[#F0F2EE] p-1.5 ${title === 'REVIEW' || title === 'RAMPUNG' ? 'hidden lg:flex' : ''}`}>
              <span className="px-1 py-0.5 text-[8.5px] font-bold tracking-[0.08em] text-[#5B6670]">{title as string}</span>
              {cards as React.ReactNode}
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const ListMock: React.FC = () => (
  <div className="overflow-hidden rounded-xl border border-line bg-white shadow-lift">
    <div className="grid grid-cols-[28px_64px_1fr_92px_40px] items-center border-b border-line bg-canvas-subtle px-3 py-2 text-[11px] font-semibold text-arang-muted"><span /><span>Kunci</span><span>Ringkasan</span><span>Status</span><span /></div>
    {[
      ['RKS-2', 'Desain logo utama dan variasi monokrom', 'DIKERJAKAN', '#E6EFFA', '#1D5FA8', 'h'],
      ['RKS-3', 'Susun panduan merek versi 1', 'DIKERJAKAN', '#E6EFFA', '#1D5FA8', 'm'],
      ['RKS-4', 'Review kemasan cup dan stiker', 'REVIEW', '#FDF3DC', '#6B4A00', 'h'],
      ['RKS-1', 'Riset kompetitor dan moodboard', 'RAMPUNG', '#E3F3F0', '#0B5F54', 'm'],
      ['RKS-5', 'Ide kampanye peluncuran Instagram', 'IDE', '#ECEEEA', '#3D4750', 'l'],
    ].map(([k, t, s, bg, fg, p]) => (
      <div key={k} className="grid grid-cols-[28px_64px_1fr_92px_40px] items-center border-t border-line-soft px-3 py-2.5 text-[12.5px]">
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] bg-brand-bright text-[8px] font-black text-white">✓</span>
        <span className="font-semibold text-brand">{k}</span>
        <span className="truncate pr-2 font-medium">{t}</span>
        <span><span className="rounded-[4px] px-1.5 py-[2px] text-[10px] font-bold" style={{ background: bg, color: fg }}>{s}</span></span>
        <span className="flex items-center gap-1.5"><Prio p={p as 'h'} /><Av c="#0F9D8A" t="RY" /></span>
      </div>
    ))}
  </div>
);

const TimelineMock: React.FC = () => (
  <div className="overflow-hidden rounded-xl border border-line bg-white p-4 shadow-lift">
    <div className="mb-3 flex justify-between text-[11px] font-semibold text-arang-muted"><span>TUGAS</span><span>November — Desember</span></div>
    {[
      ['Riset & moodboard', 0, 22, '#0F9D8A'],
      ['Desain logo', 15, 40, '#1D5FA8'],
      ['Panduan merek', 35, 38, '#1D5FA8'],
      ['Kemasan & stiker', 50, 25, '#F2B33D'],
      ['Peluncuran', 82, 0, '#F2B33D'],
    ].map(([n, x, w, c]) => (
      <div key={n as string} className="grid grid-cols-[120px_1fr] items-center gap-3 border-t border-line-soft py-2.5 text-[12.5px]">
        <span className="truncate font-medium">{n as string}</span>
        <div className="relative h-5 rounded bg-[repeating-linear-gradient(90deg,transparent_0,transparent_calc(10%-1px),#F1F2F0_calc(10%-1px),#F1F2F0_10%)]">
          {(w as number) > 0
            ? <span className="absolute top-0.5 h-4 rounded" style={{ left: `${x}%`, width: `${w}%`, background: c as string }} />
            : <span className="absolute top-0.5 h-4 w-4 rotate-45 rounded-sm" style={{ left: `${x}%`, background: c as string }} />}
        </div>
      </div>
    ))}
    <div className="mt-2 flex items-center gap-2 text-[11px] text-arang-muted"><span className="h-3 w-0.5 bg-brand-bright" />Garis hijau = hari ini · belah ketupat = milestone</div>
  </div>
);

const ReportMock: React.FC = () => (
  <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-lift">
    <div className="grid grid-cols-3 gap-2">
      {[['Tugas aktif', '24', '#1F2933'], ['Rampung minggu ini', '11', '#0B7A6B'], ['Terlambat', '2', '#B42318']].map(([l, v, c]) => (
        <div key={l} className="rounded-lg border border-line-soft p-2.5"><div className="text-[10.5px] text-arang-muted">{l}</div><div className="text-xl font-bold" style={{ color: c }}>{v}</div></div>
      ))}
    </div>
    <div className="rounded-lg border border-line-soft p-3">
      <div className="mb-1 text-[12px] font-bold">Burndown proyek</div>
      <svg viewBox="0 0 300 110" className="h-[120px] w-full">
        {[20, 45, 70, 95].map((y) => <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="#ECEEEA" />)}
        <line x1="10" y1="12" x2="290" y2="98" stroke="#A9B4BB" strokeDasharray="5 5" strokeWidth="1.5" />
        <polyline points="10,12 50,16 90,30 130,34 170,52 210,60 250,74" fill="none" stroke="#0F9D8A" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="250" cy="74" r="4.5" fill="#0F9D8A" />
      </svg>
    </div>
  </div>
);

const SHOWCASE: { key: string; tab: string; icon: React.ReactNode; title: string; text: string; points: string[]; mock: React.ReactNode }[] = [
  { key: 'papan', tab: 'Papan', icon: <Columns3 size={16} />, title: 'Papan Kanban yang terasa ringan', text: 'Seret kartu antar kolom, saring dengan satu klik pada avatar anggota, dan lihat prioritas, tenggat, serta progres subtask sekilas.', points: ['Kunci tiket berurutan per proyek, mis. WBL-12', 'Filter cepat: tugas saya, prioritas tinggi, tenggat dekat', 'Tetap nyaman dipakai dari ponsel'], mock: <AppMock /> },
  { key: 'daftar', tab: 'Daftar', icon: <LayoutList size={16} />, title: 'Daftar yang bisa diurutkan dan diedit di tempat', text: 'Urutkan menurut kunci, status, prioritas, atau tenggat. Ubah status dan penanggung jawab langsung dari tabel tanpa membuka tiket.', points: ['Kelompokkan per status atau per orang', 'Buat tugas baru dari baris terakhir', 'Ekspor ke CSV untuk laporan'], mock: <ListMock /> },
  { key: 'linimasa', tab: 'Linimasa', icon: <ChartNoAxesGantt size={16} />, title: 'Linimasa untuk melihat gambaran besar', text: 'Rencanakan urutan pekerjaan, tandai milestone, dan atur dependensi agar tidak ada yang menunggu tanpa kabar.', points: ['Dependensi antar tiket', 'Milestone dan tanggal mulai–tenggat', 'Kalender bulanan dari data yang sama'], mock: <TimelineMock /> },
  { key: 'laporan', tab: 'Laporan', icon: <BarChart3 size={16} />, title: 'Laporan siap untuk rapat mingguan', text: 'Dasbor workspace, burndown per proyek, dan beban kerja tim dihitung langsung dari data — bukan diisi ulang di spreadsheet.', points: ['Burndown aktual vs ideal', 'Beban kerja per anggota', 'Ringkasan kesehatan proyek'], mock: <ReportMock /> },
];

/* ───────────────── Halaman ───────────────── */

export const Landing: React.FC = () => {
  const [yearly, setYearly] = useState(false);
  const catalog = usePlanCatalog();
  const free = planOf(catalog, 'gratis')?.limits;
  const saving = yearlySaving(catalog);
  const [tab, setTab] = useState(SHOWCASE[0].key);
  const show = SHOWCASE.find((s) => s.key === tab) ?? SHOWCASE[0];
  const price = (m: number | null) => (m === null ? 'Hubungi kami' : m === 0 ? 'Rp0' : rupiah(yearly ? m * catalog.yearlyChargedMonths : m));

  return (
    <div className="bg-white text-arang">
      {/* ── Navigasi ── */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0E171C]/90 backdrop-blur-md">
        <div className={`${wrap} flex h-[68px] items-center justify-between gap-4`}>
          <a href={href.landing} aria-label="Rampung"><Logo size={30} dark /></a>
          <nav aria-label="Navigasi utama" className="hidden items-center gap-8 text-[14px] font-medium md:flex">
            {[['#fitur', 'Fitur'], ['#modul', 'Modul'], ['#harga', 'Harga'], ['#faq', 'FAQ']].map(([h, l]) => <a key={h} href={h} onClick={(e) => scrollTo(e, h)} className="transition-colors hover:text-white" style={{ color: '#C9D1D6' }}>{l}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <a href={href.masuk} className="hidden h-10 items-center rounded-lg px-4 text-[14px] font-semibold transition-colors hover:bg-white/10 sm:inline-flex" style={{ color: '#fff' }}>Masuk</a>
            <a href={href.daftar} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#F2B33D] px-4 text-[14px] font-bold shadow-[0_8px_24px_-8px_rgba(242,179,61,.6)] transition hover:brightness-105" style={{ color: '#2A1D00' }}>Mulai gratis</a>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative bg-[#0E171C] text-white" style={{ color: '#fff' }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-[#0F9D8A] opacity-25 blur-[140px]" />
          <div className="absolute -right-24 top-24 h-[420px] w-[420px] rounded-full bg-[#F2B33D] opacity-[0.12] blur-[140px]" />
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
        </div>
        <div className={`${wrap} relative flex flex-col items-center gap-7 pb-10 pt-16 text-center md:pt-24`}>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[13px] font-medium" style={{ color: '#D7F0EB' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#F2B33D]" />Manajemen proyek berbahasa Indonesia
          </span>
          <h1 className="m-0 max-w-[920px] text-[42px] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[58px] md:text-[72px]">
            Dari ide sampai{' '}
            <span className="bg-gradient-to-r from-[#5EE0C9] via-[#2BC4A9] to-[#F2B33D] bg-clip-text text-transparent">rampung.</span>
          </h1>
          <p className="m-0 max-w-[640px] text-[17px] leading-relaxed md:text-[19px]" style={{ color: '#B9C4CA' }}>
            Rencanakan, lacak, dan selesaikan pekerjaan tim dalam satu tempat — dari tiket dan linimasa sampai klien, jam kerja, dan invoice.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href={href.daftar} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#F2B33D] px-7 text-[15px] font-bold shadow-[0_14px_40px_-12px_rgba(242,179,61,.7)] transition hover:brightness-105" style={{ color: '#2A1D00' }}>Mulai gratis <ArrowRight size={17} /></a>
            <a href="#fitur" onClick={(e) => scrollTo(e, '#fitur')} className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-7 text-[15px] font-semibold transition hover:bg-white/10" style={{ color: '#fff' }}>Lihat fitur</a>
          </div>
          <span className="text-[13px]" style={{ color: '#8A9AA3' }}>Gratis untuk tim sampai {limitText(free?.members ?? null)} orang · Tanpa kartu kredit · Harga dalam rupiah</span>
        </div>
        <div className={`${wrap} relative z-10 -mb-32 pt-6 sm:-mb-48 lg:-mb-56`}>
          <div className="mx-auto max-w-[1080px]"><AppMock /></div>
        </div>
      </section>

      {/* ── Pilar ── */}
      <section className="bg-white pb-20 pt-44 sm:pt-60 lg:pt-72">
        <div className={`${wrap} grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4`}>
          {pillars.map((p) => (
            <div key={p.title} className="flex flex-col gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#CFEAE4] bg-gradient-to-br from-[#F2FAF8] to-[#E3F3F0] text-brand">{p.icon}</span>
              <h3 className="m-0 text-[18px] font-bold">{p.title}</h3>
              <p className="m-0 text-[15px] leading-relaxed text-arang-body">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Showcase bertab ala Jira ── */}
      <section id="fitur" className="scroll-mt-20 border-y border-line bg-[#F7F8F6] py-24">
        <div className={`${wrap} flex flex-col gap-12`}>
          <div className="mx-auto flex max-w-[720px] flex-col items-center gap-4 text-center">
            <Eyebrow>Satu data, banyak tampilan</Eyebrow>
            <h2 className="m-0 text-[34px] font-extrabold leading-tight tracking-[-0.03em] md:text-[44px]">Setiap orang melihat pekerjaan dengan cara yang paling jelas baginya.</h2>
          </div>
          <div role="tablist" aria-label="Tampilan" className="mx-auto flex flex-wrap justify-center gap-1 rounded-2xl border border-line bg-white p-1.5 shadow-card">
            {SHOWCASE.map((s) => (
              <button key={s.key} type="button" role="tab" aria-selected={tab === s.key} onClick={() => setTab(s.key)}
                className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border-0 px-5 text-[14px] font-semibold transition-all ${tab === s.key ? 'bg-[#0E171C] text-white shadow-lift' : 'bg-transparent text-arang-body hover:bg-canvas'}`}>
                {s.icon}{s.tab}
              </button>
            ))}
          </div>
          <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="flex flex-col gap-5">
              <h3 className="m-0 text-[28px] font-bold leading-tight tracking-[-0.02em]">{show.title}</h3>
              <p className="m-0 text-[16px] leading-relaxed text-arang-body">{show.text}</p>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {show.points.map((p) => <li key={p} className="flex items-start gap-3 text-[15px]"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><Check size={12} strokeWidth={3} /></span>{p}</li>)}
              </ul>
            </div>
            <div>{show.mock}</div>
          </div>
        </div>
      </section>

      {/* ── Detail tiket ── */}
      <section className="py-24">
        <div className={`${wrap} grid items-center gap-14 lg:grid-cols-2`}>
          <div aria-hidden="true" className="relative">
            <div className="absolute -inset-6 rounded-[28px] bg-gradient-to-br from-[#E3F3F0] via-white to-[#FDF3DC]" />
            <div className="relative flex flex-col gap-3 rounded-2xl border border-line bg-white p-5 shadow-pop">
              <div className="flex items-center gap-2 text-[12px] text-arang-muted">Proyek / Rebranding Kopi Senja / <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] bg-brand-bright text-[8px] font-black text-white">✓</span><b className="text-arang">RKS-2</b><span className="ml-auto rounded-[4px] bg-[#E6EFFA] px-2 py-0.5 text-[11px] font-bold text-[#1D5FA8]">DIKERJAKAN ▾</span></div>
              <div className="text-[20px] font-bold leading-snug">Desain logo utama dan variasi monokrom</div>
              <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
                <div className="flex flex-col gap-2 text-[13px]">
                  <span className="font-bold">Subtask</span>
                  {[['Sketsa awal', true], ['Digitalisasi', false], ['Presentasi ke klien', false]].map(([n, d]) => <span key={n as string} className="flex items-center gap-2 rounded-md border border-line-soft px-2 py-1.5"><span className={`h-3.5 w-3.5 rounded border ${d ? 'border-brand-bright bg-brand-bright' : 'border-line-strong'}`} /><span style={d ? { textDecoration: 'line-through', color: '#8A949B' } : undefined}>{n as string}</span></span>)}
                  <span className="mt-1 font-bold">Aktivitas</span>
                  <span className="flex gap-2"><Av c="#B4530B" t="SN" /><span className="rounded-lg bg-canvas px-2.5 py-1.5 text-[12.5px]">Versi monokrom sudah diunggah, mohon dicek @Dimas.</span></span>
                </div>
                <div className="flex flex-col gap-2 rounded-lg border border-line p-3 text-[12px]">
                  <span className="font-bold">Detail</span>
                  {[['Penanggung jawab', 'Dimas'], ['Prioritas', '↑ Tinggi'], ['Tenggat', '26 Nov'], ['Estimasi', '8 jam']].map(([k, v]) => <span key={k} className="flex justify-between gap-2"><span className="text-arang-muted">{k}</span><b>{v}</b></span>)}
                  <span className="mt-1 h-1.5 rounded-full bg-line-soft"><span className="block h-1.5 w-2/5 rounded-full bg-brand-bright" /></span>
                  <span className="text-arang-muted">3 j 20 m tercatat</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-5">
            <Eyebrow>Tiket yang lengkap</Eyebrow>
            <h2 className="m-0 text-[34px] font-extrabold leading-tight tracking-[-0.03em] md:text-[42px]">Semua konteks pekerjaan dalam satu halaman.</h2>
            <p className="m-0 text-[16px] leading-relaxed text-arang-body">Deskripsi, subtask, lampiran, tiket terkait, komentar dengan @mention, riwayat perubahan, dan pencatatan waktu — tidak perlu lagi mencari di chat.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[[<FileText key="1" size={16} />, 'Lampiran & dokumen proyek'], [<GitBranch key="2" size={16} />, 'Dependensi antar tiket'], [<Bell key="3" size={16} />, 'Notifikasi & pengamat'], [<Clock key="4" size={16} />, 'Timer dan log kerja']].map(([i, t]) => <span key={t as string} className="flex items-center gap-2.5 rounded-xl border border-line px-3.5 py-3 text-[14px] font-medium"><span className="text-brand">{i}</span>{t}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* ── Modul bisnis ── */}
      <section id="modul" className="scroll-mt-20 relative overflow-hidden bg-[#0E171C] py-24 text-white" style={{ color: '#fff' }}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 top-0 h-[480px] w-[480px] rounded-full bg-[#0F9D8A] opacity-20 blur-[140px]" />
        <div className={`${wrap} relative flex flex-col gap-12`}>
          <div className="flex max-w-[680px] flex-col gap-4">
            <Eyebrow dark>Modul bisnis</Eyebrow>
            <h2 className="m-0 text-[34px] font-extrabold leading-tight tracking-[-0.03em] md:text-[44px]">Lebih dari papan tugas — sampai ke klien dan keuangan.</h2>
            <p className="m-0 text-[16px] leading-relaxed" style={{ color: '#B9C4CA' }}>Aktifkan hanya modul yang dibutuhkan. Semuanya memakai data proyek yang sama.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <div key={m.title} className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition-colors hover:border-[#0F9D8A]/50 hover:bg-white/[0.07]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F9D8A]/15 text-[#5EE0C9]">{m.icon}</span>
                <h3 className="m-0 text-[17px] font-bold">{m.title}</h3>
                <p className="m-0 text-[14.5px] leading-relaxed" style={{ color: '#AEBAC1' }}>{m.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Untuk siapa ── */}
      <section className="py-24">
        <div className={`${wrap} grid gap-12 lg:grid-cols-[0.8fr_1.2fr]`}>
          <div className="flex flex-col gap-4">
            <Eyebrow>Untuk siapa</Eyebrow>
            <h2 className="m-0 text-[34px] font-extrabold leading-tight tracking-[-0.03em] md:text-[42px]">Dibuat untuk cara kerja tim Indonesia.</h2>
            <p className="m-0 text-[16px] leading-relaxed text-arang-body">Bahasa Indonesia sepenuhnya, harga dalam rupiah, pembayaran QRIS atau transfer, dan WhatsApp sebagai jalur komunikasi utama.</p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
            {audiences.map(([t, d], i) => (
              <div key={t} className="flex flex-col gap-2 bg-white p-7">
                <span className="text-[12px] font-bold text-brand">0{i + 1}</span>
                <h3 className="m-0 text-[17px] font-bold">{t}</h3>
                <p className="m-0 text-[14.5px] leading-relaxed text-arang-body">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Harga ── */}
      <section id="harga" className="scroll-mt-20 border-t border-line bg-[#F7F8F6] py-24">
        <div className={`${wrap} flex flex-col gap-12`}>
          <div className="mx-auto flex max-w-[680px] flex-col items-center gap-4 text-center">
            <Eyebrow>Harga</Eyebrow>
            <h2 className="m-0 text-[34px] font-extrabold leading-tight tracking-[-0.03em] md:text-[44px]">Harga rupiah yang jujur.</h2>
            <p className="m-0 text-[16px] text-arang-body">Bayar per anggota. Tidak diperpanjang otomatis — Anda yang memutuskan.</p>
            <div role="group" aria-label="Periode tagihan" className="mt-2 inline-flex gap-1 rounded-xl border border-line bg-white p-1 text-[14px] shadow-card">
              <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)} className={`h-9 cursor-pointer rounded-lg border-0 px-4 font-semibold transition ${!yearly ? 'bg-[#0E171C] text-white' : 'bg-transparent text-arang-body'}`}>Bulanan</button>
              <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)} className={`h-9 cursor-pointer rounded-lg border-0 px-4 font-semibold transition ${yearly ? 'bg-[#0E171C] text-white' : 'bg-transparent text-arang-body'}`}>Tahunan {saving > 0 && <span className="ml-1 rounded-md bg-kunyit-soft px-1.5 text-[11px] font-bold" style={{ color: '#6B4A00' }}>hemat {saving} bulan</span>}</button>
            </div>
          </div>
          <div className="grid items-stretch gap-5 md:grid-cols-2 lg:grid-cols-4">
            {catalog.plans.map((p) => {
              const dark = !!p.popular;
              const unit = p.key === 'gratis' ? `sampai ${limitText(p.limits.members)} anggota` : p.monthly === null ? 'harga sesuai kebutuhan' : 'per pengguna per bulan';
              const cta = p.key === 'gratis' ? 'Mulai gratis' : p.key === 'pro' ? (catalog.trialDays > 0 ? `Coba Pro ${catalog.trialDays} hari` : 'Pilih Pro') : p.key === 'bisnis' ? 'Pilih Bisnis' : 'Hubungi kami';
              return (
                <div key={p.key} className={`relative flex flex-col gap-5 rounded-2xl p-7 ${dark ? 'bg-[#0E171C] text-white shadow-[0_30px_80px_-30px_rgba(14,23,28,.7)] lg:-my-3' : 'border border-line bg-white shadow-card'}`} style={dark ? { color: '#fff' } : undefined}>
                  {dark && <span className="absolute -top-3 left-7 rounded-full bg-[#F2B33D] px-3 py-1 text-[11.5px] font-bold" style={{ color: '#2A1D00' }}>Paling populer</span>}
                  <div className="flex flex-col gap-1">
                    <h3 className="m-0 text-[18px] font-bold">{p.name}</h3>
                    <span className="text-[13.5px]" style={{ color: dark ? '#AEBAC1' : '#5B6670' }}>{p.desc}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className={`font-extrabold tracking-[-0.02em] ${p.monthly === null ? "text-[26px] leading-[1.3]" : "text-[34px]"}`}>{price(p.monthly)}</span>
                    <span className="text-[13px]" style={{ color: dark ? '#AEBAC1' : '#5B6670' }}>{p.monthly ? (yearly ? 'per pengguna per tahun' : unit) : unit}</span>
                  </div>
                  <a href={p.key === 'enterprise' ? '#faq' : href.daftar} onClick={p.key === 'enterprise' ? (e) => scrollTo(e, '#faq') : undefined}
                    className={`inline-flex h-11 items-center justify-center rounded-xl text-[14.5px] font-bold transition ${dark ? 'bg-[#F2B33D] hover:brightness-105' : 'border border-line bg-white hover:border-line-strong hover:bg-canvas-subtle'}`}
                    style={{ color: dark ? '#2A1D00' : '#1F2933' }}>{cta}</a>
                  <ul className="m-0 flex list-none flex-col gap-2.5 border-t p-0 pt-5 text-[14px]" style={{ borderColor: dark ? 'rgba(255,255,255,.1)' : '#ECEEEA' }}>
                    {p.items.map((i) => <li key={i} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0" color={dark ? '#5EE0C9' : '#0B7A6B'} />{i}</li>)}
                  </ul>
                </div>
              );
            })}
          </div>
          <span className="text-center text-[13px] text-arang-muted">Harga belum termasuk pajak. Pembayaran lewat QRIS atau transfer rekening, diverifikasi sebelum paket aktif.</span>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="scroll-mt-20 py-24">
        <div className={`${wrap} grid gap-12 lg:grid-cols-[0.8fr_1.2fr]`}>
          <div className="flex flex-col gap-4">
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="m-0 text-[34px] font-extrabold leading-tight tracking-[-0.03em] md:text-[42px]">Pertanyaan yang sering diajukan.</h2>
            <p className="m-0 text-[16px] text-arang-body">Butuh paket Enterprise atau pertanyaan lain? Masuk lalu hubungi kami dari menu Kelola paket.</p>
          </div>
          <div className="flex flex-col divide-y divide-line border-y border-line">
            {faqsFor(free).map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16.5px] font-semibold [&::-webkit-details-marker]:hidden">
                  {q}<ChevronDown size={18} className="shrink-0 text-arang-muted transition-transform group-open:rotate-180" />
                </summary>
                <p className="m-0 mt-3 max-w-[640px] text-[15px] leading-relaxed text-arang-body">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Ajakan akhir ── */}
      <section className="px-5 pb-24 sm:px-8">
        <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0B5F54] via-[#0B7A6B] to-[#0E171C] px-8 py-16 text-center text-white md:py-20" style={{ color: '#fff' }}>
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-[360px] w-[360px] rounded-full bg-[#F2B33D] opacity-20 blur-[120px]" />
          <div aria-hidden="true" className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="relative mx-auto flex max-w-[640px] flex-col items-center gap-5">
            <h2 className="m-0 text-[34px] font-extrabold leading-tight tracking-[-0.03em] md:text-[46px]">Ide tim Anda, kita bikin rampung.</h2>
            <p className="m-0 text-[17px]" style={{ color: '#CDEDE7' }}>Buat workspace dalam satu menit, lalu undang tim lewat tautan.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <a href={href.daftar} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#F2B33D] px-7 text-[15px] font-bold shadow-[0_14px_40px_-12px_rgba(242,179,61,.7)] transition hover:brightness-105" style={{ color: '#2A1D00' }}>Mulai gratis <ArrowRight size={17} /></a>
              <a href={href.masuk} className="inline-flex h-12 items-center rounded-xl border border-white/25 px-7 text-[15px] font-semibold transition hover:bg-white/10" style={{ color: '#fff' }}>Masuk</a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Kaki halaman ── */}
      <footer className="bg-[#0E171C] py-14 text-[14px]" style={{ color: '#AEBAC1' }}>
        <div className={`${wrap} flex flex-col gap-10`}>
          <div className="flex flex-wrap justify-between gap-10">
            <div className="flex max-w-[340px] flex-col gap-3"><Logo dark /><span className="leading-relaxed">Dari ide sampai rampung. Manajemen proyek, klien, dan keuangan untuk tim Indonesia.</span></div>
            <div className="flex flex-wrap gap-16">
              {[['Produk', [['Fitur', '#fitur'], ['Modul', '#modul'], ['Harga', '#harga']]], ['Akun', [['Masuk', href.masuk], ['Daftar gratis', href.daftar], ['Lupa kata sandi', href.lupa]]], ['Bantuan', [['FAQ', '#faq']]]].map(([t, ls]) => (
                <div key={t as string} className="flex flex-col gap-2.5"><span className="font-bold text-white" style={{ color: '#fff' }}>{t as string}</span>{(ls as string[][]).map(([l, h]) => <a key={l} href={h} onClick={h.startsWith('#') && !h.startsWith('#/') ? (e) => scrollTo(e, h) : undefined} className="transition-colors hover:text-white" style={{ color: '#AEBAC1' }}>{l}</a>)}</div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-[13px]">
            <span>© 2026 Rampung · rampung.id</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} />Pembayaran diverifikasi manual · <Receipt size={14} />Harga dalam rupiah</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
