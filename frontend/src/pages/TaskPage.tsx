import React, { useRef, useState } from 'react';
import { ArrowLeft, Link2, Paperclip, Play, Square, Trash2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { go, href } from '../store/router';
import type { Priority, TaskStatus } from '../types';
import { Avatar, Empty, LabelPill, Pill, Progress, StatusPill } from '../components/ui';
import { LABELS, PRIORITY, STATUS, STATUS_ORDER } from '../lib/meta';
import { fmtClock, fmtDate, fmtDue, fmtDuration, isOverdue, pct, timeAgo } from '../lib/format';

export const TaskPage: React.FC<{ taskId: string }> = ({ taskId }) => {
  const { tasks, projects, comments, activities, users, user, me, updateTask, deleteTask, moveTask, toggleSubtask, addSubtask, addComment, addAttachment, uploadAttachment, timer, timerSeconds, startTimer, stopTimer, workspace, notify } = useApp();
  const [msg, setMsg] = useState('');
  const [sub, setSub] = useState('');
  const [editDesc, setEditDesc] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return <Empty title="Tugas tidak ditemukan" text="Tugas ini mungkin sudah dihapus."><a className="btn btn-primary" href={href.tugasSaya}>Ke Tugas Saya</a></Empty>;

  const p = projects.find((x) => x.id === t.projectId);
  const cs = comments.filter((c) => c.taskId === t.id);
  const acts = activities.filter((a) => a.taskId === t.id).slice(0, 6);
  const done = t.subtasks.filter((s) => s.completed).length;
  const running = timer?.taskId === t.id;
  const logged = t.loggedSeconds + (running ? timerSeconds : 0);
  const deps = t.dependencies.map((id) => tasks.find((x) => x.id === id)).filter(Boolean) as typeof tasks;
  const blockers = deps.filter((d) => d.status !== 'done');
  const late = isOverdue(t.dueDate, t.status === 'done');

  const send = (e: React.FormEvent) => { e.preventDefault(); if (!msg.trim()) return; addComment(t.id, msg.trim()); setMsg(''); };
  const mention = (name: string) => setMsg((m) => `${m}${m && !m.endsWith(' ') ? ' ' : ''}@${name} `);
  const renderMsg = (s: string) => s.split(/(@\w+)/g).map((part, i) => (part.startsWith('@') ? <span key={i} className="font-semibold" style={{ color: '#0B5F54' }}>{part}</span> : <React.Fragment key={i}>{part}</React.Fragment>));

  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2 text-[13px] text-arang-muted"><a href={p ? href.proyek(p.id) : href.beranda} className="inline-flex items-center gap-1"><ArrowLeft size={14} />Kembali ke board</a><span>· {p?.name}</span></span>
        <div className="flex gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { navigator.clipboard?.writeText(window.location.href); notify('Tautan disalin', undefined, 'success'); }}><Link2 size={15} />Salin tautan</button>
          <button type="button" aria-label="Hapus tugas" className="btn-icon" onClick={() => { if (window.confirm(`Hapus tugas "${t.title}"?`)) { deleteTask(t.id); go(p ? href.proyek(p.id) : href.beranda); } }}><Trash2 size={16} /></button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <article className="card flex min-w-0 flex-[999_1_480px] flex-col gap-6 p-5 sm:p-7">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2"><StatusPill status={t.status} /><LabelPill label={t.label} />{t.priority === 'high' && <Pill bg="#FDECEA" fg="#B42318">Prioritas tinggi</Pill>}{t.isMilestone && <Pill bg="#1F2933" fg="#fff">Milestone</Pill>}</div>
            <label htmlFor="judul" className="sr-only">Judul tugas</label>
            <input id="judul" value={t.title} onChange={(e) => updateTask(t.id, { title: e.target.value })} className="w-full border-0 bg-transparent p-0 text-[28px] font-extrabold tracking-[-0.4px] outline-none" />
          </div>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between"><h2 className="m-0 text-[15px] font-bold">Deskripsi</h2><button type="button" className="cursor-pointer border-0 bg-transparent text-[13px] font-semibold text-brand" onClick={() => setEditDesc(!editDesc)}>{editDesc ? 'Selesai' : 'Ubah'}</button></div>
            {editDesc ? <textarea aria-label="Deskripsi" className="input min-h-[110px]" value={t.description} onChange={(e) => updateTask(t.id, { description: e.target.value })} /> : <p className="m-0 text-[15px] leading-relaxed text-arang-body">{t.description || 'Belum ada deskripsi.'}</p>}
          </section>

          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between"><h2 className="m-0 text-[15px] font-bold">Subtask</h2><span className="text-[13px] text-arang-muted">{done} dari {t.subtasks.length} rampung</span></div>
            <Progress value={pct(done, t.subtasks.length)} />
            {t.subtasks.map((s) => (
              <label key={s.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[10px] border border-line-soft px-3 text-sm">
                <input type="checkbox" checked={s.completed} onChange={() => toggleSubtask(t.id, s.id)} className="h-[18px] w-[18px]" style={{ accentColor: '#0B7A6B' }} />
                <span className="flex-1" style={{ color: s.completed ? '#5B6670' : '#1F2933', textDecoration: s.completed ? 'line-through' : 'none' }}>{s.title}</span>
                {s.assigneeId && <span className="text-xs text-arang-muted">{user(s.assigneeId).shortName}</span>}
              </label>
            ))}
            <form onSubmit={(e) => { e.preventDefault(); if (sub.trim()) { addSubtask(t.id, sub.trim()); setSub(''); } }} className="flex gap-2">
              <label htmlFor="sub" className="sr-only">Subtask baru</label>
              <input id="sub" className="input input-sm h-11 flex-1" placeholder="Tambah subtask..." value={sub} onChange={(e) => setSub(e.target.value)} />
              <button type="submit" className="btn btn-outline">Tambah</button>
            </form>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="m-0 text-[15px] font-bold">Lampiran Berkas</h2>
            <div className="flex flex-wrap gap-3">
              {t.attachments.map((a) => (
                a.url ? (
                  <a
                    key={a.id}
                    href={a.url.startsWith('http') ? a.url : `http://localhost:8000${a.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-24 min-w-[160px] flex-1 flex-col justify-end rounded-[10px] bg-line-soft p-2.5 text-xs text-arang-body hover:bg-line-strong transition-colors cursor-pointer"
                  >
                    <span className="truncate font-semibold text-primary">{a.name}</span>
                    <span className="text-arang-muted">{a.size} · Unduh berkas</span>
                  </a>
                ) : (
                  <div key={a.id} className="flex h-24 min-w-[160px] flex-1 flex-col justify-end rounded-[10px] bg-line-soft p-2.5 text-xs text-arang-body">
                    <span className="truncate font-semibold">{a.name}</span>
                    <span className="text-arang-muted">{a.size}</span>
                  </div>
                )
              ))}
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { uploadAttachment(t.id, f); e.target.value = ''; } }} />
              <button type="button" onClick={() => fileRef.current?.click()} className="flex h-24 min-w-[160px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-dashed border-line-strong bg-transparent text-[13px] text-arang-muted hover:border-primary transition-colors"><Paperclip size={15} />Unggah file</button>
            </div>
            <span className="text-xs text-arang-muted">Berkas diunggah dan disimpan ke server Rampung.</span>
          </section>

          <section className="flex flex-col gap-3.5">
            <h2 className="m-0 text-[15px] font-bold">Komentar</h2>
            {!cs.length && <span className="text-sm text-arang-muted">Belum ada komentar.</span>}
            {cs.map((c) => (
              <div key={c.id} className="flex gap-3"><Avatar userId={c.userId} size={32} /><div className="flex flex-col gap-1 text-sm leading-relaxed"><span><strong>{user(c.userId).name}</strong> <span className="text-xs text-arang-muted">· {timeAgo(c.createdAt)}</span></span><span>{renderMsg(c.content)}</span></div></div>
            ))}
            <form onSubmit={send} className="flex flex-col gap-2">
              <div className="flex gap-2"><label htmlFor="komentar" className="sr-only">Tulis komentar</label><input id="komentar" className="input h-11 min-w-0 flex-1 text-sm" placeholder="Tulis komentar, klik nama di bawah untuk @mention..." value={msg} onChange={(e) => setMsg(e.target.value)} /><button type="submit" className="btn btn-primary">Kirim</button></div>
              <div className="flex flex-wrap gap-1.5 text-xs">{users.filter((u) => u.id !== me.id).map((u) => <button key={u.id} type="button" onClick={() => mention(u.shortName)} className="cursor-pointer rounded-full border border-line bg-white px-2.5 py-1 text-arang-body">@{u.shortName}</button>)}</div>
            </form>
          </section>
        </article>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <section className="card flex flex-col gap-3.5 p-5 text-sm">
            <h2 className="m-0 text-[15px] font-bold">Detail</h2>
            <Row label="Status"><select aria-label="Status" className="input input-sm w-auto" value={t.status} onChange={(e) => moveTask(t.id, e.target.value as TaskStatus)}>{STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select></Row>
            <Row label="Penanggung jawab"><select aria-label="Penanggung jawab" className="input input-sm w-auto" value={t.assigneeId} onChange={(e) => updateTask(t.id, { assigneeId: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Row>
            <Row label="Prioritas"><select aria-label="Prioritas" className="input input-sm w-auto" value={t.priority} onChange={(e) => updateTask(t.id, { priority: e.target.value as Priority })}>{(Object.keys(PRIORITY) as Priority[]).map((x) => <option key={x} value={x}>{PRIORITY[x].label}</option>)}</select></Row>
            <Row label="Label"><select aria-label="Label" className="input input-sm w-auto" value={t.label} onChange={(e) => updateTask(t.id, { label: e.target.value })}>{Object.keys(LABELS).map((x) => <option key={x}>{x}</option>)}</select></Row>
            <Row label="Mulai"><input aria-label="Tanggal mulai" type="date" className="input input-sm w-auto" value={t.startDate} onChange={(e) => e.target.value && updateTask(t.id, { startDate: e.target.value })} /></Row>
            <Row label="Tenggat"><input aria-label="Tenggat" type="date" className="input input-sm w-auto" value={t.dueDate} onChange={(e) => e.target.value && updateTask(t.id, { dueDate: e.target.value })} /></Row>
            <div className="-mt-1 text-right text-xs font-semibold" style={{ color: late ? '#B42318' : '#5B6670' }}>{fmtDue(t.dueDate, t.status === 'done')}</div>
            <Row label="Estimasi"><span className="flex items-center gap-1.5"><input aria-label="Estimasi jam" type="number" min={0} className="input input-sm w-[72px]" value={t.estimatedHours ?? ''} onChange={(e) => updateTask(t.id, { estimatedHours: e.target.value ? Number(e.target.value) : undefined })} />jam</span></Row>
            <Row label="Proyek"><a href={p ? href.proyek(p.id) : '#'} className="font-semibold">{p?.shortName}</a></Row>
            <Row label="Pengamat"><span className="font-semibold">{t.watcherIds.length ? t.watcherIds.map((id) => user(id).shortName).join(', ') : '–'}</span></Row>
          </section>

          {workspace.enabledModules.timeTracking ? (
            <section className="flex flex-col gap-3 rounded-card bg-arang p-5 text-white" style={{ color: '#fff' }}>
              <span className="text-[13px]" style={{ color: '#C9D1D6' }}>Time tracking</span>
              <span className="tabular text-4xl font-extrabold tracking-wide">{fmtClock(running ? timerSeconds : 0)}</span>
              <span className="text-[13px]" style={{ color: '#C9D1D6' }}>Total tercatat {fmtDuration(logged)}{t.estimatedHours ? ` dari estimasi ${t.estimatedHours} j` : ''}</span>
              <button type="button" onClick={() => (running ? stopTimer() : startTimer(t.id))} className="btn btn-kunyit">{running ? <><Square size={14} />Hentikan & simpan</> : <><Play size={14} />Mulai timer</>}</button>
            </section>
          ) : (
            <section className="card flex flex-col gap-2 p-5 text-sm"><h2 className="m-0 text-[15px] font-bold">Time tracking</h2><span className="text-arang-muted">Aktifkan modul Time Tracking di Toko modul untuk mencatat jam kerja per tugas.</span></section>
          )}

          <section className="card flex flex-col gap-2.5 p-5 text-sm">
            <h2 className="m-0 text-[15px] font-bold">Dependensi</h2>
            {!deps.length && <span className="text-arang-muted">Tidak bergantung pada tugas lain.</span>}
            {!!blockers.length && <span className="text-arang-muted">Menunggu tugas ini selesai:</span>}
            {deps.map((d) => <a key={d.id} href={href.tugas(d.id)} className="flex justify-between rounded-[10px] border border-line-soft px-3 py-2.5 font-semibold" style={{ color: '#1F2933' }}>{d.title}<span className="text-xs" style={{ color: d.status === 'done' ? '#0B5F54' : '#8A5A00' }}>{STATUS[d.status].label}</span></a>)}
            <label htmlFor="dep" className="sr-only">Tambah dependensi</label>
            <select id="dep" className="input input-sm" value="" onChange={(e) => e.target.value && updateTask(t.id, { dependencies: [...t.dependencies, e.target.value] })}>
              <option value="">+ Tambah dependensi...</option>
              {tasks.filter((x) => x.projectId === t.projectId && x.id !== t.id && !t.dependencies.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
          </section>

          <section className="card flex flex-col gap-2.5 p-5 text-[13px] leading-relaxed text-arang-muted">
            <h2 className="m-0 text-[15px] font-bold text-arang" style={{ color: '#1F2933' }}>Aktivitas</h2>
            {acts.map((a) => <span key={a.id}>{user(a.userId).shortName} {a.text} · {timeAgo(a.createdAt)}</span>)}
            <span>{user(t.createdBy).shortName} membuat tugas ini · {fmtDate(t.createdAt.slice(0, 10))}</span>
          </section>
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3"><span className="text-arang-muted">{label}</span>{children}</div>
);
