import React, { useEffect, useMemo, useState } from 'react';
import { Download, Mail, MessageCircle, Play, Plus, Send, Square, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store/AppContext';
import { InvoicePayment } from '../components/InvoicePayment';
import { go, href } from '../store/router';
import type { DealStage } from '../types';
import { Avatar, Empty, Field, Modal, PageHeader, Pill, Progress, Segmented, Stat } from '../components/ui';
import { DEAL_STAGES, TONE } from '../lib/meta';
import { HARI, randomToken, addDays, diffDays, exportCsv, fmtClock, fmtDate, fmtDateLong, fmtDayDate, fmtDuration, isOverdue, parseISODate, pct, relDay, rupiah, rupiahJt, todayISO, errMsg } from '../lib/format';

const shell = 'flex flex-col gap-5 px-4 py-6 sm:px-8';

const Locked: React.FC<{ name: string }> = ({ name }) => {
  const { setModal } = useApp();
  return (
    <div className={shell}><Empty title={`Modul ${name} belum aktif`} text="Aktifkan lewat Toko modul. Modul bisnis hanya muncul saat dibutuhkan."><button type="button" className="btn btn-primary mt-2" onClick={() => setModal('modules')}>Buka Toko modul</button></Empty></div>
  );
};

const csv = (name: string, rows: (string | number | boolean | null | undefined)[][]) => exportCsv(name, rows);

/* ---------------- Time Tracking ---------------- */
export const TimePage: React.FC = () => {
  const { workspace, timeEntries, tasks, projects, user, me, timer, timerSeconds, startTimer, stopTimer, addTimeEntry, updateWorkspace, setModal } = useApp();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ taskId: '', hours: '1', minutes: '0', billable: true, date: todayISO() });
  const today = todayISO();
  const monday = addDays(today, -((parseISODate(today).getDay() + 6) % 7));
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = addDays(monday, i); return { d, label: HARI[parseISODate(d).getDay()], sec: timeEntries.filter((e) => e.date === d).reduce((s, e) => s + e.durationSeconds, 0) + (timer && d === today ? timerSeconds : 0) }; }), [timeEntries, monday, timer, timerSeconds, today]);
  const weekEntries = timeEntries.filter((e) => e.date >= monday && e.date <= addDays(monday, 6));
  const total = week.reduce((s, d) => s + d.sec, 0);
  const bill = weekEntries.filter((e) => e.isBillable).reduce((s, e) => s + e.durationSeconds, 0);
  const rate = workspace.hourlyRate;
  const running = timer ? tasks.find((t) => t.id === timer.taskId) : null;
  const maxSec = Math.max(8 * 3600, ...week.map((d) => d.sec));
  if (!workspace.enabledModules.timeTracking) return <Locked name="Time Tracking" />;

  const save = () => {
    const t = tasks.find((x) => x.id === f.taskId);
    const sec = Number(f.hours) * 3600 + Number(f.minutes) * 60;
    if (!t || sec <= 0) return;
    addTimeEntry({ taskId: t.id, taskTitle: t.title, projectId: t.projectId, userId: me.id, date: f.date, durationSeconds: sec, isBillable: f.billable });
    setOpen(false);
  };

  return (
    <div className={shell}>
      <PageHeader eyebrow="Modul Bisnis" title="Time Tracking">
        <span className="btn btn-outline pointer-events-none">{fmtDate(monday)} – {fmtDate(addDays(monday, 6))}</span>
        <button type="button" className="btn btn-outline" onClick={() => csv('timesheet.csv', [['Tanggal', 'Tugas', 'Proyek', 'Anggota', 'Durasi (jam)', 'Billable'], ...weekEntries.map((e) => [e.date, e.taskTitle, projects.find((p) => p.id === e.projectId)?.shortName ?? '', user(e.userId).shortName, (e.durationSeconds / 3600).toFixed(2), e.isBillable ? 'Ya' : 'Tidak'])])}><Download size={15} />Ekspor timesheet</button>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} />Catat manual</button>
      </PageHeader>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-arang p-5 text-white" style={{ color: '#fff' }}>
        <div className="flex items-center gap-3.5"><span className="h-3 w-3 rounded-full" style={{ background: running ? '#F2B33D' : '#5B6670' }} /><div className="flex flex-col gap-0.5"><span className="text-[13px]" style={{ color: '#C9D1D6' }}>{running ? 'Sedang berjalan' : 'Tidak ada timer aktif'}</span><span className="text-base font-bold">{running ? `${running.title} · ${projects.find((p) => p.id === running.projectId)?.shortName}` : 'Mulai dari tugas mana pun'}</span></div></div>
        {running ? <div className="flex items-center gap-4"><span className="tabular text-[34px] font-extrabold tracking-wide">{fmtClock(timerSeconds)}</span><button type="button" className="btn btn-kunyit" onClick={stopTimer}><Square size={14} />Hentikan</button></div>
          : <div className="flex items-center gap-2"><label htmlFor="mulai" className="sr-only">Pilih tugas</label><select id="mulai" className="input input-sm h-11 w-[240px]" value="" onChange={(e) => e.target.value && startTimer(e.target.value)}><option value="">Pilih tugas untuk mulai timer...</option>{tasks.filter((t) => t.status !== 'done' && t.assigneeId === me.id).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select><Play size={18} color="#F2B33D" /></div>}
      </section>

      <div className="flex flex-wrap items-stretch gap-4">
        <section className="card flex min-w-0 flex-[2_1_420px] flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between"><h2 className="card-title">Jam kerja minggu ini</h2><span className="text-[13px] text-arang-muted">Target 40 j</span></div>
          <div className="flex h-[190px] items-end gap-3.5">
            {week.map((d) => (
              <div key={d.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-xs font-bold text-arang-body">{d.sec ? `${Math.round((d.sec / 3600) * 10) / 10} j` : '–'}</span>
                <div className="w-full max-w-[48px] rounded-t-md" style={{ height: Math.max(3, (d.sec / maxSec) * 130), background: d.d === today ? '#F2B33D' : '#0F9D8A' }} />
                <span className="text-xs text-arang-muted">{d.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="grid min-w-0 flex-[1_1_260px] grid-cols-2 gap-3">
          <Stat label="Total" value={<span className="text-2xl">{fmtDuration(total)}</span>} />
          <Stat label="Billable" value={<span className="text-2xl">{fmtDuration(bill)}</span>} tone="#0B7A6B" />
          <div className="card flex flex-col gap-1.5 p-4"><label htmlFor="tarif" className="text-[13px] text-arang-muted">Tarif per jam</label><input id="tarif" type="number" min={0} step={5000} className="input input-sm" placeholder="Rp / jam" value={rate || ''} onChange={(e) => updateWorkspace({ hourlyRate: Number(e.target.value) })} /></div>
          <div className="card flex flex-col gap-1 p-4"><span className="text-[13px] text-arang-muted">Siap ditagih</span><span className="text-lg font-extrabold">{rate ? rupiah((bill / 3600) * rate) : '–'}</span>{workspace.enabledModules.finance ? <a href={href.keuangan} className="text-sm font-bold">Buat invoice →</a> : <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-bold text-brand" onClick={() => setModal('modules')}>Aktifkan Keuangan</button>}</div>
        </section>
      </div>

      <section className="card overflow-x-auto">
        <div className="border-b border-line-soft px-5 py-4"><h2 className="card-title">Timesheet</h2></div>
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead><tr className="text-left text-xs text-arang-muted">{['Tanggal', 'Tugas', 'Proyek', 'Anggota', 'Durasi', 'Billable'].map((h) => <th key={h} className="px-3 py-2.5 font-semibold first:pl-5">{h}</th>)}</tr></thead>
          <tbody>{[...timeEntries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15).map((e) => (
            <tr key={e.id} className="border-t border-line-soft"><td className="py-3 pl-5 pr-3 text-arang-muted">{fmtDayDate(e.date)}</td><td className="px-3 py-3 font-semibold">{e.taskTitle}</td><td className="px-3 py-3 text-arang-body">{projects.find((p) => p.id === e.projectId)?.shortName}</td><td className="px-3 py-3">{user(e.userId).shortName}</td><td className="tabular px-3 py-3 font-bold">{fmtDuration(e.durationSeconds)}</td><td className="px-3 py-3">{e.isBillable ? <Pill bg="#E3F3F0" fg="#0B5F54" className="font-bold">Ya</Pill> : <Pill bg="#ECEEEA" fg="#3D4750" className="font-bold">Tidak</Pill>}</td></tr>
          ))}</tbody>
        </table>
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title="Catat waktu manual" footer={<><button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Batal</button><button type="button" className="btn btn-primary" disabled={!f.taskId} onClick={save}>Simpan</button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Tugas" htmlFor="mt"><select id="mt" className="input" value={f.taskId} onChange={(e) => setF({ ...f, taskId: e.target.value })}><option value="">Pilih tugas...</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
          <div className="grid grid-cols-3 gap-3"><Field label="Tanggal" htmlFor="md"><input id="md" type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field><Field label="Jam" htmlFor="mh"><input id="mh" type="number" min={0} className="input" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field><Field label="Menit" htmlFor="mm"><input id="mm" type="number" min={0} max={59} className="input" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></Field></div>
          <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" checked={f.billable} onChange={(e) => setF({ ...f, billable: e.target.checked })} style={{ accentColor: '#0B7A6B' }} className="h-[18px] w-[18px]" />Billable (bisa ditagihkan ke klien)</label>
        </div>
      </Modal>
    </div>
  );
};

/* ---------------- CRM ---------------- */
export const CrmPage: React.FC<{ tab: 'pipeline' | 'klien' | 'portal' }> = ({ tab }) => {
  const { workspace, deals, clients, projects, tasks, moveDeal, createDeal, addClient, deleteClient, deleteDeal, notify, mode, updateProject } = useApp();
  const [open, setOpen] = useState(false);
  const [clientModal, setClientModal] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [f, setF] = useState({ clientId: '', company: '', contact: '', need: '', value: '', stage: 'prospect' as DealStage });
  const [cf, setCf] = useState({ company: '', contact: '', email: '', phone: '', status: 'lead' as 'lead' | 'active' | 'past' });
  // Proyek yang portalnya sudah aktif tetapi belum punya token (data lama) diberi token.
  useEffect(() => {
    projects.forEach((p) => { if (p.clientPortalEnabled && !p.portalToken) updateProject(p.id, { portalToken: randomToken() }); });
  }, [projects, updateProject]);
  if (!workspace.enabledModules.crm) return <Locked name="CRM Klien" />;
  const cl = (id: string) => clients.find((c) => c.id === id);
  const stageOf = (s: DealStage) => deals.filter((d) => d.stage === s);
  const sum = (ds: typeof deals) => ds.reduce((a, d) => a + d.value, 0);
  const openDeals = deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
  const won30 = deals.filter((d) => d.stage === 'won' && d.closedAt && diffDays(d.closedAt.slice(0, 10), todayISO()) <= 30);
  const closed90 = deals.filter((d) => (d.stage === 'won' || d.stage === 'lost') && d.closedAt && diffDays(d.closedAt.slice(0, 10), todayISO()) <= 90);
  const rate = pct(closed90.filter((d) => d.stage === 'won').length, closed90.length);

  const submit = () => {
    const value = Number(f.value) * 1_000_000;
    if (!f.need.trim() || value <= 0) return;
    if (f.clientId === 'new') {
      if (!f.company.trim()) return;
      createDeal({ clientId: '', need: f.need, value, stage: f.stage, nextAction: 'Hubungi klien', urgent: false }, { company: f.company, contact: f.contact || '-', email: '', phone: '', status: 'lead' });
    } else if (f.clientId) createDeal({ clientId: f.clientId, need: f.need, value, stage: f.stage, nextAction: 'Hubungi klien', urgent: false });
    else return;
    setOpen(false);
    setF({ clientId: '', company: '', contact: '', need: '', value: '', stage: 'prospect' });
  };

  return (
    <div className={shell}>
      <PageHeader eyebrow="Modul Bisnis" title="CRM Klien">
        <div className="inline-flex gap-1 rounded-[10px] bg-canvas-seg p-1 text-sm" role="navigation" aria-label="Tampilan CRM">
          {([['pipeline', 'Pipeline'], ['klien', 'Daftar klien'], ['portal', 'Portal klien']] as const).map(([k, l]) => <a key={k} href={href.crm(k)} aria-current={tab === k ? 'page' : undefined} className="flex h-9 items-center rounded-lg px-3.5" style={tab === k ? { background: '#fff', color: '#1F2933', fontWeight: 700 } : { color: '#3D4750' }}>{l}</a>)}
        </div>
        <div className="flex items-center gap-2">
          {tab === 'klien' && (
            <>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() =>
                  csv('daftar-klien.csv', [
                    ['Perusahaan', 'Kontak', 'Email', 'Telepon', 'Status', 'Total Deal'],
                    ...clients.map((c) => [
                      c.company,
                      c.contact,
                      c.email || '',
                      c.phone || '',
                      c.status,
                      String(sum(deals.filter((d) => d.clientId === c.id && d.stage !== 'lost'))),
                    ]),
                  ])
                }
              >
                <Download size={15} />
                Unduh CSV
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setClientModal(true)}>
                <Plus size={16} />
                Klien baru
              </button>
            </>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} />Deal baru</button>
        </div>
      </PageHeader>

      {tab === 'pipeline' && <>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          <Stat label="Nilai pipeline" value={rupiahJt(sum(openDeals))} note={`${openDeals.length} deal terbuka`} />
          <Stat label="Menang 30 hari" value={rupiahJt(sum(won30))} tone="#0B7A6B" note={`${won30.length} deal`} />
          <Stat label="Tingkat menang" value={`${rate}%`} note="90 hari terakhir" />
          <Stat label="Tindak lanjut mendesak" value={openDeals.filter((d) => d.urgent).length} tone="#8A5A00" note="telepon dan email" />
        </div>
        <div className="flex items-start gap-4 overflow-x-auto pb-2">
          {DEAL_STAGES.map((s) => { const ds = stageOf(s.key); return (
            <section key={s.key} aria-label={s.label} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId) moveDeal(dragId, s.key); setDragId(null); }} className="flex w-[270px] shrink-0 flex-col gap-2.5 rounded-card bg-line-soft p-3">
              <div className="flex items-baseline justify-between px-1 pt-1"><h2 className="m-0 text-sm font-bold">{s.label} <span className="font-medium text-arang-muted">{ds.length}</span></h2><span className="text-[13px] font-bold text-arang-body">{rupiahJt(sum(ds))}</span></div>
              {ds.map((d) => { const tone = d.stage === 'won' ? TONE.won : d.urgent ? TONE.urgent : TONE.calm; return (
                <div key={d.id} draggable onDragStart={() => setDragId(d.id)} className="flex cursor-grab flex-col gap-2 rounded-[10px] border border-line bg-white p-3.5">
                  <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold">{cl(d.clientId)?.company}</span><span className="whitespace-nowrap text-[13px] font-extrabold" style={{ color: '#0B5F54' }}>{rupiahJt(d.value)}</span></div>
                  <span className="text-[13px] leading-snug text-arang-body">{d.need}</span>
                  <div className="flex items-center justify-between gap-2 text-xs text-arang-muted"><span>{cl(d.clientId)?.contact}</span><Pill bg={tone[0]} fg={tone[1]} className="font-bold">{d.nextAction}</Pill></div>
                  <div className="flex items-center gap-1.5">
                    <label className="sr-only" htmlFor={`st-${d.id}`}>Pindah tahap</label>
                    <select id={`st-${d.id}`} className="input input-sm h-8 text-xs flex-1" value={d.stage} onChange={(e) => moveDeal(d.id, e.target.value as DealStage)}>{DEAL_STAGES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}<option value="lost">Kalah</option></select>
                    <button type="button" title="Hapus deal" onClick={() => deleteDeal(d.id)} className="btn-icon p-1 text-arang-muted hover:text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
                  </div>
                </div>); })}
              {!ds.length && <span className="py-3 text-center text-[13px] text-arang-muted">Seret deal ke sini</span>}
            </section>); })}
        </div>
      </>}

      {tab === 'klien' && (
        <section className="card overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-sm">
          <thead><tr className="text-left text-xs text-arang-muted">{['Klien', 'Kontak', 'Email', 'Telepon', 'Status', 'Nilai deal', 'Aksi'].map((h) => <th key={h} className="px-3 py-2.5 font-semibold first:pl-5">{h}</th>)}</tr></thead>
          <tbody>{clients.map((c) => <tr key={c.id} className="border-t border-line-soft"><td className="py-3 pl-5 pr-3 font-semibold">{c.company}</td><td className="px-3 py-3">{c.contact}</td><td className="px-3 py-3 text-arang-body">{c.email || '–'}</td><td className="px-3 py-3 text-arang-body">{c.phone || '–'}</td><td className="px-3 py-3"><Pill bg={c.status === 'active' ? '#E3F3F0' : c.status === 'lead' ? '#FDF3DC' : '#ECEEEA'} fg={c.status === 'active' ? '#0B5F54' : c.status === 'lead' ? '#6B4A00' : '#3D4750'} className="font-bold">{c.status === 'active' ? 'Aktif' : c.status === 'lead' ? 'Prospek' : 'Lama'}</Pill></td><td className="px-3 py-3 font-bold">{rupiahJt(sum(deals.filter((d) => d.clientId === c.id && d.stage !== 'lost')))}</td><td className="px-3 py-3"><div className="flex items-center gap-1.5">{c.phone && <a href={`https://wa.me/${c.phone.replace(/[^0-9]/g, '').replace(/^0/, '62')}`} target="_blank" rel="noreferrer" title="Chat WhatsApp" className="btn-icon p-1 text-emerald-600 hover:bg-emerald-50"><MessageCircle size={15} /></a>}{c.email && <a href={`mailto:${c.email}`} title="Kirim Email" className="btn-icon p-1 text-blue-600 hover:bg-blue-50"><Mail size={15} /></a>}<button type="button" title="Hapus Klien" onClick={() => deleteClient(c.id)} className="btn-icon p-1 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button></div></td></tr>)}</tbody>
        </table></section>
      )}

      {tab === 'portal' && (
        <div className="flex flex-col gap-4">
          <p className="m-0 max-w-2xl text-sm text-arang-body">Portal klien memberi klien halaman baca-saja untuk memantau progres proyek tanpa perlu akun Rampung. Aktifkan per proyek.</p>
          {projects.filter((p) => p.clientId).map((p) => { const ts = tasks.filter((t) => t.projectId === p.id); const v = pct(ts.filter((t) => t.status === 'done').length, ts.length); return (
            <div key={p.id} className="card flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2"><span className="font-bold">{p.name}</span><span className="text-[13px] text-arang-muted">{cl(p.clientId!)?.company} · {v}% rampung</span><Progress value={v} h={6} /></div>
              <div className="flex items-center gap-2">
                {p.clientPortalEnabled && p.portalToken && <><a className="btn btn-outline btn-sm" href={href.portal(p.portalToken)} target="_blank" rel="noreferrer">Buka portal</a><button type="button" className="btn btn-outline btn-sm" onClick={() => { navigator.clipboard?.writeText(`${location.origin}/${href.portal(p.portalToken!)}`); notify('Tautan portal disalin', mode === 'server' ? undefined : 'Portal hanya berfungsi setelah masuk dengan akun (bukan mode lokal).', 'success'); }}>Salin tautan</button></>}
                <PortalToggle id={p.id} on={p.clientPortalEnabled} tokenOf={p.portalToken} />
              </div>
            </div>); })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Deal baru" footer={<><button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Batal</button><button type="button" className="btn btn-primary" onClick={submit}>Simpan deal</button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Klien" htmlFor="dc"><select id="dc" className="input" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}><option value="">Pilih klien...</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}<option value="new">+ Klien baru</option></select></Field>
          {f.clientId === 'new' && <div className="grid grid-cols-2 gap-3"><Field label="Nama perusahaan" htmlFor="dn"><input id="dn" className="input" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field><Field label="Nama kontak" htmlFor="dk"><input id="dk" className="input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field></div>}
          <Field label="Kebutuhan klien" htmlFor="dnd"><input id="dnd" className="input" placeholder="Contoh: Website profil perusahaan" value={f.need} onChange={(e) => setF({ ...f, need: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Nilai (juta rupiah)" htmlFor="dv"><input id="dv" type="number" min={0} className="input" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field><Field label="Tahap" htmlFor="ds"><select id="ds" className="input" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value as DealStage })}>{DEAL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field></div>
        </div>
      </Modal>

      <Modal open={clientModal} onClose={() => setClientModal(false)} title="Klien baru" footer={<><button type="button" className="btn btn-outline" onClick={() => setClientModal(false)}>Batal</button><button type="button" className="btn btn-primary" disabled={!cf.company.trim()} onClick={() => { addClient(cf); setClientModal(false); setCf({ company: '', contact: '', email: '', phone: '', status: 'lead' }); }}>Simpan klien</button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Nama perusahaan / klien" htmlFor="cl-co"><input id="cl-co" required className="input" placeholder="PT Maju Bersama" value={cf.company} onChange={(e) => setCf({ ...cf, company: e.target.value })} /></Field>
          <Field label="Nama kontak (PIC)" htmlFor="cl-ct"><input id="cl-ct" className="input" placeholder="Budi Santoso" value={cf.contact} onChange={(e) => setCf({ ...cf, contact: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" htmlFor="cl-em"><input id="cl-em" type="email" className="input" placeholder="budi@majubersama.com" value={cf.email} onChange={(e) => setCf({ ...cf, email: e.target.value })} /></Field>
            <Field label="Nomor WhatsApp" htmlFor="cl-ph"><input id="cl-ph" className="input" placeholder="08123456789" value={cf.phone} onChange={(e) => setCf({ ...cf, phone: e.target.value })} /></Field>
          </div>
          <Field label="Status" htmlFor="cl-st">
            <select id="cl-st" className="input" value={cf.status} onChange={(e) => setCf({ ...cf, status: e.target.value as 'lead' | 'active' | 'past' })}>
              <option value="lead">Prospek (Lead)</option>
              <option value="active">Aktif</option>
              <option value="past">Klien lama</option>
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  );
};

const PortalToggle: React.FC<{ id: string; on: boolean; tokenOf?: string }> = ({ id, on, tokenOf }) => {
  const { updateProject, canUseModule, setModal, notify } = useApp();
  return <button type="button" role="switch" aria-checked={on} aria-label="Portal klien" onClick={() => { if (!canUseModule('integrations')) { notify('Portal klien ada di paket Bisnis'); setModal('pricing'); return; } updateProject(id, { clientPortalEnabled: !on, ...(!on && !tokenOf ? { portalToken: randomToken() } : {}) }); }} className="relative h-7 w-12 cursor-pointer rounded-full border-0 transition-colors" style={{ background: on ? '#0B7A6B' : '#C9CEC8' }}><span className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all" style={{ left: on ? 24 : 4 }} /></button>;
};

/* ---------------- Keuangan ---------------- */
export const FinancePage: React.FC = () => {
  const { workspace, invoices, clients, projects, expenses, createInvoice, addExpense, setModal, notify, canManage, integrations, mode } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const [inv, setInv] = useState(false);
  const [exp, setExp] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);
  const [fi, setFi] = useState({ clientId: '', projectId: '', desc: '', amount: '' });
  const [fe, setFe] = useState({ projectId: '', title: '', amount: '', category: 'operasional' });
  if (!workspace.enabledModules.finance) return <Locked name="Keuangan" />;
  if (!canManage) return <div className={shell}><Empty title="Akses terbatas" text="Modul ini hanya untuk pemilik dan admin workspace." /></div>;
  const client = (id: string) => clients.find((c) => c.id === id);
  const total = (i: (typeof invoices)[number]) => i.items.reduce((s, x) => s + x.amount, 0);
  const status = (i: (typeof invoices)[number]) => (i.status === 'paid' ? 'Lunas' : isOverdue(i.dueDate) ? 'Lewat tempo' : 'Menunggu');
  const tone = { Lunas: ['#E3F3F0', '#0B5F54'], 'Lewat tempo': ['#FDECEA', '#B42318'], Menunggu: ['#FDF3DC', '#6B4A00'] } as const;
  const unpaid = invoices.filter((i) => i.status === 'unpaid');
  const late = unpaid.filter((i) => isOverdue(i.dueDate));
  const paid30 = invoices.filter((i) => i.status === 'paid' && i.paidAt && diffDays(i.paidAt.slice(0, 10), todayISO()) <= 30);
  const bProjects = projects.filter((p) => p.budget > 0);
  const budget = bProjects.reduce((s, p) => s + p.budget, 0);
  const spent = bProjects.reduce((s, p) => s + p.spent, 0);
  const preview = invoices.find((i) => i.id === sel) ?? invoices[0];

  return (
    <div className={shell}>
      <PageHeader eyebrow="Modul Bisnis" title="Keuangan Proyek">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() =>
            csv('daftar-invoice.csv', [
              ['Nomor', 'Klien', 'Jumlah (Rp)', 'Jatuh Tempo', 'Status'],
              ...invoices.map((i) => [
                i.number,
                client(i.clientId)?.company || '',
                String(total(i)),
                i.dueDate,
                status(i),
              ]),
            ])
          }
        >
          <Download size={15} />
          Unduh CSV
        </button>
        <button type="button" className="btn btn-outline" onClick={() => setExp(true)}><Plus size={15} />Catat pengeluaran</button>
        <button type="button" className="btn btn-primary" onClick={() => setInv(true)}><Plus size={16} />Buat invoice</button>
      </PageHeader>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <Stat label="Belum dibayar" value={rupiahJt(unpaid.reduce((s, i) => s + total(i), 0))} note={`${unpaid.length} invoice`} />
        <Stat label="Lewat jatuh tempo" value={rupiahJt(late.reduce((s, i) => s + total(i), 0))} tone={late.length ? '#B42318' : undefined} note={late.length ? late.map((i) => client(i.clientId)?.company).join(', ') : 'Tidak ada'} />
        <Stat label="Diterima 30 hari" value={rupiahJt(paid30.reduce((s, i) => s + total(i), 0))} tone="#0B7A6B" note={`${paid30.length} invoice lunas`} />
        <Stat label="Anggaran terpakai" value={`${pct(spent, budget)}%`} note={`${rupiahJt(spent)} dari ${rupiahJt(budget)}`} />
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-4">
          <section className="card overflow-x-auto"><div className="border-b border-line-soft px-5 py-4"><h2 className="card-title">Invoice</h2></div>
            <table className="w-full min-w-[640px] border-collapse text-sm"><thead><tr className="text-left text-xs text-arang-muted">{['Nomor', 'Klien', 'Jumlah', 'Jatuh tempo', 'Status'].map((h, i) => <th key={h} className={`px-3 py-2.5 font-semibold first:pl-5 ${i === 2 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>{invoices.map((i) => { const s = status(i); return (
                <tr key={i.id} onClick={() => setSel(i.id)} className="cursor-pointer border-t border-line-soft" style={{ background: preview?.id === i.id ? '#F7FBFA' : undefined }}>
                  <td className="py-3 pl-5 pr-3 font-semibold">{i.number}</td><td className="px-3 py-3"><span className="flex flex-col"><span className="font-semibold">{client(i.clientId)?.company}</span><span className="text-xs text-arang-muted">{i.items[0]?.description}</span></span></td>
                  <td className="tabular px-3 py-3 text-right font-bold">{rupiah(total(i))}</td><td className="px-3 py-3 text-arang-body">{fmtDate(i.dueDate)}</td><td className="px-3 py-3"><Pill bg={tone[s][0]} fg={tone[s][1]} className="font-bold">{s}</Pill></td></tr>); })}</tbody></table></section>
          <section className="card flex flex-col gap-3.5 p-5"><h2 className="card-title">Anggaran per proyek</h2>
            {bProjects.map((p) => { const v = pct(p.spent, p.budget); return <div key={p.id} className="flex flex-col gap-1.5"><div className="flex justify-between gap-3 text-sm"><span className="font-semibold">{p.shortName}</span><span className="text-arang-muted">{rupiahJt(p.spent)} dari {rupiahJt(p.budget)}</span></div><Progress value={v} h={8} color={v >= 75 ? '#F2B33D' : '#0F9D8A'} /></div>; })}
            {expenses.length > 0 && <div className="mt-2 flex flex-col text-sm"><span className="mb-1 text-xs font-bold text-arang-muted">PENGELUARAN TERBARU</span>{expenses.slice(0, 4).map((e) => <div key={e.id} className="flex justify-between gap-3 border-t border-line-soft py-2"><span>{e.title}<span className="text-xs text-arang-muted"> · {projects.find((p) => p.id === e.projectId)?.shortName}</span></span><span className="font-semibold">{rupiah(e.amount)}</span></div>)}</div>}
          </section>
        </div>
        {preview && (
          <section aria-label="Pratinjau invoice" className="card print-area flex min-w-0 flex-[2_1_340px] flex-col gap-4 p-6">
            <div className="flex items-start justify-between"><div className="flex flex-col"><span className="text-xs font-bold tracking-[0.6px] text-arang-muted">INVOICE</span><span className="text-xl font-extrabold">{preview.number}</span></div>{(() => { const s = status(preview); return <Pill bg={tone[s][0]} fg={tone[s][1]} className="font-bold">{s}</Pill>; })()}</div>
            <div className="flex justify-between gap-4 text-[13px] leading-relaxed"><div className="flex flex-col"><span className="text-arang-muted">Kepada</span><span className="font-bold">{client(preview.clientId)?.company}</span><span>u.p. {client(preview.clientId)?.contact}</span></div><div className="flex flex-col text-right"><span className="text-arang-muted">Jatuh tempo</span><span className="font-bold">{fmtDateLong(preview.dueDate)}</span></div></div>
            <div className="flex flex-col gap-2 border-y border-line-soft py-3 text-sm">{preview.items.map((x, i) => <div key={i} className="flex justify-between gap-3"><span>{x.description}</span><span className="whitespace-nowrap font-bold">{rupiah(x.amount)}</span></div>)}</div>
            <div className="flex justify-between text-lg font-extrabold"><span>Total</span><span>{rupiah(total(preview))}</span></div>
            <InvoicePayment invoice={preview} total={total(preview)} />
            <div className="no-print flex flex-wrap gap-2">
              <button
                type="button"
                disabled={sendingWa}
                className="btn btn-primary flex-1"
                onClick={async () => {
                  const c = client(preview.clientId);
                  if (mode !== 'server' || !integrations?.whatsapp.configured) {
                    notify('WhatsApp belum dikonfigurasi', 'Server belum memiliki WHATSAPP_TOKEN dan WHATSAPP_PHONE_NUMBER_ID.');
                    setModal('wa');
                    return;
                  }
                  const phone = c?.phone || '';
                  if (!phone) {
                    notify('Nomor telepon tidak ada', 'Klien belum memiliki nomor telepon WhatsApp.');
                    return;
                  }
                  setSendingWa(true);
                  try {
                    await api.sendWhatsApp({
                      phone,
                      message: `Halo ${c?.contact || c?.company}, tagihan invoice ${preview.number} sebesar ${rupiah(total(preview))} telah diterbitkan dengan jatuh tempo ${fmtDateLong(preview.dueDate)}. Silakan lakukan pembayaran atau hubungi kami bila ada pertanyaan. Terima kasih!`
                    });
                    notify('Diterima WhatsApp', `Pesan untuk ${c?.contact || c?.company} (${phone}) dikirim.`, 'wa');
                  } catch (err) {
                    notify('Gagal kirim WhatsApp', errMsg(err, 'Gateway WhatsApp tidak merespons.'));
                  } finally {
                    setSendingWa(false);
                  }
                }}
              >
                <Send size={15} />
                {sendingWa ? 'Mengirim...' : 'Kirim via WhatsApp'}
              </button>
              <button type="button" className="btn btn-outline flex-1" onClick={() => window.print()}>Unduh PDF</button>
            </div>
          </section>
        )}
      </div>

      <Modal open={inv} onClose={() => setInv(false)} title="Buat invoice" footer={<><button type="button" className="btn btn-outline" onClick={() => setInv(false)}>Batal</button><button type="button" className="btn btn-primary" disabled={!fi.clientId || !fi.desc || !Number(fi.amount)} onClick={() => { const n = createInvoice({ clientId: fi.clientId, projectId: fi.projectId || undefined, items: [{ description: fi.desc, amount: Number(fi.amount) }], issueDate: todayISO(), dueDate: relDay(14) }); setSel(n.id); setInv(false); setFi({ clientId: '', projectId: '', desc: '', amount: '' }); }}>Terbitkan</button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Klien" htmlFor="ic"><select id="ic" className="input" value={fi.clientId} onChange={(e) => setFi({ ...fi, clientId: e.target.value })}><option value="">Pilih klien...</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</select></Field>
          <Field label="Proyek (opsional)" htmlFor="ip"><select id="ip" className="input" value={fi.projectId} onChange={(e) => setFi({ ...fi, projectId: e.target.value })}><option value="">–</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</select></Field>
          <Field label="Uraian" htmlFor="id"><input id="id" className="input" placeholder="Contoh: Termin 2 (50%) website" value={fi.desc} onChange={(e) => setFi({ ...fi, desc: e.target.value })} /></Field>
          <Field label="Jumlah (Rp)" htmlFor="ia" hint="Jatuh tempo otomatis 14 hari dari hari ini."><input id="ia" type="number" min={0} className="input" value={fi.amount} onChange={(e) => setFi({ ...fi, amount: e.target.value })} /></Field>
        </div>
      </Modal>
      <Modal open={exp} onClose={() => setExp(false)} title="Catat pengeluaran" footer={<><button type="button" className="btn btn-outline" onClick={() => setExp(false)}>Batal</button><button type="button" className="btn btn-primary" disabled={!fe.projectId || !fe.title || !Number(fe.amount)} onClick={() => { addExpense({ projectId: fe.projectId, title: fe.title, amount: Number(fe.amount), category: fe.category as never, date: todayISO() }); setExp(false); setFe({ projectId: '', title: '', amount: '', category: 'operasional' }); }}>Simpan</button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Proyek" htmlFor="ep"><select id="ep" className="input" value={fe.projectId} onChange={(e) => setFe({ ...fe, projectId: e.target.value })}><option value="">Pilih proyek...</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</select></Field>
          <Field label="Keterangan" htmlFor="et"><input id="et" className="input" value={fe.title} onChange={(e) => setFe({ ...fe, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Jumlah (Rp)" htmlFor="eam"><input id="eam" type="number" min={0} className="input" value={fe.amount} onChange={(e) => setFe({ ...fe, amount: e.target.value })} /></Field><Field label="Kategori" htmlFor="ek"><select id="ek" className="input" value={fe.category} onChange={(e) => setFe({ ...fe, category: e.target.value })}>{['operasional', 'vendor', 'software', 'transport', 'lainnya'].map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}</select></Field></div>
        </div>
      </Modal>
    </div>
  );
};

/* ---------------- SDM ---------------- */
export const SdmPage: React.FC = () => {
  const { workspace, attendances, leaves, users, user, me, tasks, checkIn, checkOut, addLeave, decideLeave } = useApp();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ type: 'tahunan', startDate: relDay(7), endDate: relDay(7), reason: '' });
  if (!workspace.enabledModules.sdm) return <Locked name="SDM" />;
  const today = todayISO();
  const mine = attendances.find((a) => a.userId === me.id && a.date === today);
  const isAdmin = me.role === 'owner' || me.role === 'admin' || me.role === 'superadmin';
  const tone = { hadir: ['#E3F3F0', '#0B5F54'], terlambat: ['#FDF3DC', '#6B4A00'], izin: ['#E6EFFA', '#1D5FA8'], cuti: ['#F0EBFB', '#5B3AA8'] } as const;
  const lt = { pending: ['Menunggu', '#FDF3DC', '#6B4A00'], approved: ['Disetujui', '#E3F3F0', '#0B5F54'], rejected: ['Ditolak', '#FDECEA', '#B42318'] } as const;
  return (
    <div className={shell}>
      <PageHeader eyebrow="Modul Bisnis" title="SDM">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() =>
            csv('daftar-presensi.csv', [
              ['Tanggal', 'Nama Anggota', 'Jam Masuk', 'Jam Pulang', 'Status'],
              ...attendances.map((a) => [
                a.date,
                user(a.userId)?.name || '',
                a.checkIn || '',
                a.checkOut || '',
                a.status,
              ]),
            ])
          }
        >
          <Download size={15} />
          Unduh CSV
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          <Plus size={15} />
          Ajukan cuti
        </button>
      </PageHeader>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-arang p-5 text-white" style={{ color: '#fff' }}>
        <div className="flex flex-col gap-1"><span className="text-[13px]" style={{ color: '#C9D1D6' }}>Absensi hari ini · {fmtDayDate(today)}</span><span className="text-lg font-bold">{!mine ? 'Belum check-in' : mine.checkOut ? `Selesai · ${mine.checkIn} – ${mine.checkOut}` : `Masuk pukul ${mine.checkIn}`}</span></div>
        {!mine ? <button type="button" className="btn btn-kunyit" onClick={checkIn}>Check-in</button> : !mine.checkOut ? <button type="button" className="btn btn-kunyit" onClick={checkOut}>Check-out</button> : null}
      </section>
      <div className="flex flex-wrap items-start gap-4">
        <section className="card min-w-0 flex-[3_1_480px] overflow-x-auto"><div className="border-b border-line-soft px-5 py-4"><h2 className="card-title">Kehadiran terbaru</h2></div>
          <table className="w-full min-w-[560px] border-collapse text-sm"><thead><tr className="text-left text-xs text-arang-muted">{['Tanggal', 'Anggota', 'Masuk', 'Pulang', 'Status'].map((h) => <th key={h} className="px-3 py-2.5 font-semibold first:pl-5">{h}</th>)}</tr></thead>
            <tbody>{!attendances.length && <tr className="border-t border-line-soft"><td colSpan={5} className="px-5 py-6 text-center text-sm text-arang-muted">Belum ada absensi. Tekan Check-in untuk mencatat kehadiran hari ini.</td></tr>}{[...attendances].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12).map((a) => <tr key={a.id} className="border-t border-line-soft"><td className="py-3 pl-5 pr-3 text-arang-muted">{fmtDayDate(a.date)}</td><td className="px-3 py-3 font-semibold">{user(a.userId).shortName}</td><td className="px-3 py-3">{a.checkIn}</td><td className="px-3 py-3">{a.checkOut ?? '–'}</td><td className="px-3 py-3"><Pill bg={tone[a.status][0]} fg={tone[a.status][1]} className="font-bold">{a.status.charAt(0).toUpperCase() + a.status.slice(1)}</Pill></td></tr>)}</tbody></table></section>
        <section className="card flex min-w-0 flex-[2_1_300px] flex-col gap-3.5 p-5"><h2 className="card-title">Kapasitas tim</h2>
          {users.map((u) => { const n = tasks.filter((t) => t.assigneeId === u.id && t.status !== 'done').length; const onLeave = leaves.some((l) => l.userId === u.id && l.status === 'approved' && l.startDate <= today && l.endDate >= today); return <div key={u.id} className="flex items-center gap-3"><Avatar userId={u.id} size={32} /><div className="flex flex-1 flex-col gap-1.5"><div className="flex justify-between text-[13px]"><span className="font-semibold">{u.name}</span><span className="text-arang-muted">{onLeave ? 'Cuti' : `${n} tugas`}</span></div><Progress value={n * 10} color={n > 10 ? '#B42318' : '#0F9D8A'} /></div></div>; })}</section>
      </div>
      <section className="card flex flex-col p-5"><h2 className="card-title mb-2">Pengajuan cuti</h2>
        {!leaves.length && <span className="py-3 text-sm text-arang-muted">Belum ada pengajuan.</span>}
        {leaves.map((l) => <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft py-3 text-sm"><div className="flex flex-col gap-0.5"><span className="font-semibold">{user(l.userId).name} · Cuti {l.type}</span><span className="text-xs text-arang-muted">{fmtDate(l.startDate)} – {fmtDate(l.endDate)} · {l.reason}</span></div><div className="flex items-center gap-2"><Pill bg={lt[l.status][1]} fg={lt[l.status][2]} className="font-bold">{lt[l.status][0]}</Pill>{l.status === 'pending' && isAdmin && <><button type="button" className="btn btn-outline btn-sm" onClick={() => decideLeave(l.id, false)}>Tolak</button><button type="button" className="btn btn-primary btn-sm" onClick={() => decideLeave(l.id, true)}>Setujui</button></>}</div></div>)}
      </section>
      <Modal open={open} onClose={() => setOpen(false)} title="Ajukan cuti" footer={<><button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Batal</button><button type="button" className="btn btn-primary" disabled={!f.reason.trim() || f.endDate < f.startDate} onClick={() => { addLeave({ ...f, type: f.type as never }); setOpen(false); setF({ ...f, reason: '' }); }}>Kirim</button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Jenis cuti" htmlFor="lt"><select id="lt" className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="tahunan">Tahunan</option><option value="sakit">Sakit</option><option value="khusus">Khusus</option></select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Mulai" htmlFor="ls"><input id="ls" type="date" className="input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field><Field label="Selesai" htmlFor="le"><input id="le" type="date" className="input" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field></div>
          <Field label="Alasan" htmlFor="lr"><textarea id="lr" className="input min-h-[90px]" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
};

export { go, Segmented };
