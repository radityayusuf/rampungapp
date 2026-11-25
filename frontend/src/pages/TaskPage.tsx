import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Clock, Copy, Eye, EyeOff, Link2, MoreHorizontal, Paperclip, Play, Plus, Square, Trash2, UserCheck, X } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { go, href } from '../store/router';
import type { Priority, TaskStatus } from '../types';
import { Avatar, Empty, IssueTypeIcon, PriorityIcon, Progress } from '../components/ui';
import { rememberViewed } from '../components/WorkItem';
import { LABELS, PRIORITY, STATUS, STATUS_ORDER } from '../lib/meta';
import { fmtClock, fmtDate, fmtDue, fmtDuration, isOverdue, pct, timeAgo } from '../lib/format';

type Tab = 'all' | 'comments' | 'history' | 'worklog';

/** Bagian panel kanan yang bisa dilipat, seperti panel "Details" di Jira. */
const Panel: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card overflow-hidden">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full cursor-pointer items-center justify-between border-0 bg-white px-4 py-3 text-left text-[14px] font-bold text-arang hover:bg-canvas-subtle">
        {title}
        <ChevronDown size={16} className="text-arang-muted transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && <div className="flex flex-col border-t border-line-soft px-4 py-2">{children}</div>}
    </section>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[128px_1fr] items-center gap-3 py-2 text-[13.5px]">
    <span className="text-arang-muted">{label}</span>
    <div className="flex min-w-0 items-center gap-2">{children}</div>
  </div>
);

/** Kontrol pilih yang tampil seperti teks biasa (gaya "inline edit" Jira) sampai disorot. */
const ghost = 'h-8 w-full min-w-0 cursor-pointer rounded-md border border-transparent bg-transparent px-1.5 text-[13.5px] text-arang outline-none hover:border-line hover:bg-canvas-subtle focus:border-brand-bright focus:bg-white';

const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-center justify-between gap-3">
    <h2 className="m-0 text-[15px] font-bold">{children}</h2>
    {right}
  </div>
);

export const TaskPage: React.FC<{ taskId: string }> = ({ taskId }) => {
  const {
    tasks, projects, comments, activities, timeEntries, users, user, me,
    updateTask, deleteTask, moveTask, toggleSubtask, addSubtask, deleteSubtask, addComment, deleteAttachment, uploadAttachment,
    timer, timerSeconds, startTimer, stopTimer, workspace, notify, taskKey,
  } = useApp();

  const [msg, setMsg] = useState('');
  const [sub, setSub] = useState('');
  const [addingSub, setAddingSub] = useState(false);
  const [editDesc, setEditDesc] = useState(false);
  const [tab, setTab] = useState<Tab>('comments');
  const [copiedKey, setCopiedKey] = useState(false);
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { rememberViewed(taskId); }, [taskId]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const t = tasks.find((x) => x.id === taskId);
  if (!t) return <Empty title="Tugas tidak ditemukan" text="Tugas ini mungkin sudah dihapus."><a className="btn btn-primary" href={href.tugasSaya}>Ke Tugas Saya</a></Empty>;

  const p = projects.find((x) => x.id === t.projectId);
  const key = taskKey(t.id);
  const cs = comments.filter((c) => c.taskId === t.id);
  const acts = activities.filter((a) => a.taskId === t.id || (t.title && a.text.includes(t.title)));
  const tLogs = timeEntries.filter((e) => e.taskId === t.id);
  const done = t.subtasks.filter((s) => s.completed).length;
  const running = timer?.taskId === t.id;
  const logged = t.loggedSeconds + (running ? timerSeconds : 0);
  const deps = t.dependencies.map((id) => tasks.find((x) => x.id === id)).filter(Boolean) as typeof tasks;
  const late = isOverdue(t.dueDate, t.status === 'done');
  const watching = t.watcherIds.includes(me.id);
  const st = STATUS[t.status];
  const estSeconds = (t.estimatedHours ?? 0) * 3600;

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msg.trim()) return;
    addComment(t.id, msg.trim());
    setMsg('');
  };
  const mention = (name: string) => setMsg((m) => `${m}${m && !m.endsWith(' ') ? ' ' : ''}@${name} `);
  const renderMsg = (s: string) => s.split(/(@\w+)/g).map((part, i) => (part.startsWith('@') ? <span key={i} className="font-semibold" style={{ color: '#0B5F54' }}>{part}</span> : <React.Fragment key={i}>{part}</React.Fragment>));

  const copyKey = () => {
    navigator.clipboard?.writeText(key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
    notify('Kunci tiket disalin', key, 'info');
  };
  const toggleWatch = () => {
    updateTask(t.id, { watcherIds: watching ? t.watcherIds.filter((x) => x !== me.id) : [...t.watcherIds, me.id] });
    notify(watching ? 'Berhenti mengamati' : 'Anda mengamati tiket ini', key, 'success');
  };
  const remove = () => {
    if (window.confirm(`Hapus tiket "${key}: ${t.title}"?`)) {
      deleteTask(t.id);
      go(p ? href.proyek(p.id) : href.beranda);
    }
  };

  // Tab "Semua": komentar dan riwayat digabung menurut waktu, seperti Jira.
  const feed = [
    ...cs.map((c) => ({ kind: 'comment' as const, id: c.id, userId: c.userId, at: c.createdAt, text: c.content })),
    ...acts.map((a) => ({ kind: 'history' as const, id: a.id, userId: a.userId, at: a.createdAt, text: a.text })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: 'Semua' },
    { key: 'comments', label: `Komentar (${cs.length})` },
    { key: 'history', label: `Riwayat (${acts.length})` },
    { key: 'worklog', label: `Log kerja (${tLogs.length})` },
  ];

  const commentItem = (id: string, userId: string, at: string, text: string) => (
    <div key={id} className="flex gap-3">
      <Avatar userId={userId} size={32} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[14px] leading-relaxed">
        <div className="flex items-center gap-2"><strong className="font-semibold">{user(userId).name}</strong><span className="text-xs text-arang-muted">{timeAgo(at)}</span></div>
        <div className="whitespace-pre-wrap text-arang-body">{renderMsg(text)}</div>
      </div>
    </div>
  );
  const historyItem = (id: string, userId: string, at: string, text: string) => (
    <div key={id} className="flex items-start gap-3 text-[13.5px]">
      <Avatar userId={userId} size={32} />
      <div className="min-w-0 flex-1 pt-1.5"><strong className="font-semibold">{user(userId).name}</strong> <span className="text-arang-body">{text}</span><span className="ml-2 text-xs text-arang-muted">{timeAgo(at)}</span></div>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-4 px-4 py-5 sm:px-8">
      {/* Jejak halaman & aksi */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Jejak halaman" className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] text-arang-muted">
          <a href={href.dashboard} style={{ color: '#5B6670' }} className="hover:underline">Proyek</a>
          <span aria-hidden="true">/</span>
          {p && <><a href={href.proyek(p.id)} style={{ color: '#5B6670' }} className="truncate hover:underline">{p.name}</a><span aria-hidden="true">/</span></>}
          <button type="button" onClick={copyKey} title="Salin kunci tiket" className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-1 py-0.5 text-[13px] font-semibold text-arang hover:bg-line-soft">
            <IssueTypeIcon size={15} milestone={t.isMilestone} />{key}{copiedKey ? <Check size={12} className="text-brand" /> : <Copy size={11} className="text-arang-muted" />}
          </button>
        </nav>

        <div className="flex items-center gap-1">
          <button type="button" onClick={toggleWatch} aria-pressed={watching} title={watching ? 'Berhenti mengamati' : 'Amati tiket ini'} className="btn btn-ghost btn-sm">
            {watching ? <EyeOff size={15} /> : <Eye size={15} />}<span className="tabular">{t.watcherIds.length}</span>
          </button>
          <button type="button" title="Salin tautan" aria-label="Salin tautan" className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(window.location.href); notify('Tautan disalin', undefined, 'success'); }}><Link2 size={15} /></button>
          <div ref={menuRef} className="relative">
            <button type="button" aria-label="Aksi lainnya" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} className="btn btn-ghost btn-sm"><MoreHorizontal size={16} /></button>
            {menu && (
              <div role="menu" className="absolute right-0 top-[calc(100%+4px)] z-30 w-52 rounded-xl border border-line bg-white p-1.5 shadow-pop">
                <button type="button" role="menuitem" onClick={() => { setMenu(false); copyKey(); }} className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 text-left text-[13.5px] hover:bg-canvas"><Copy size={14} />Salin kunci tiket</button>
                <button type="button" role="menuitem" aria-label="Hapus tugas" onClick={() => { setMenu(false); remove(); }} className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 text-left text-[13.5px] hover:bg-danger-soft" style={{ color: '#B42318' }}><Trash2 size={14} />Hapus tiket</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ─────────── Kolom utama ─────────── */}
        <article className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-3">
            <label htmlFor="judul" className="sr-only">Judul tugas</label>
            <input
              id="judul"
              value={t.title}
              onChange={(e) => updateTask(t.id, { title: e.target.value })}
              className="-mx-2 w-[calc(100%+16px)] rounded-lg border border-transparent bg-transparent px-2 py-1 text-[24px] font-bold leading-tight tracking-[-0.3px] text-arang outline-none transition-colors hover:bg-white hover:border-line focus:border-brand-bright focus:bg-white"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}><Paperclip size={14} />Lampirkan</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setAddingSub(true)}><Plus size={14} />Tambah subtask</button>
              {t.assigneeId !== me.id && <button type="button" className="btn btn-outline btn-sm" onClick={() => { updateTask(t.id, { assigneeId: me.id }); notify('Ditugaskan ke Anda', t.title, 'success'); }}><UserCheck size={14} />Tugaskan ke saya</button>}
            </div>
          </div>

          {/* Deskripsi */}
          <section className="flex flex-col gap-2">
            <SectionTitle right={!editDesc && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditDesc(true)}>Ubah</button>}>Deskripsi</SectionTitle>
            {editDesc ? (
              <div className="flex flex-col gap-2">
                <textarea aria-label="Deskripsi" autoFocus className="input min-h-[140px]" value={t.description} onChange={(e) => updateTask(t.id, { description: e.target.value })} />
                <div><button type="button" className="btn btn-primary btn-sm" onClick={() => setEditDesc(false)}>Selesai</button></div>
              </div>
            ) : (
              <button type="button" onClick={() => setEditDesc(true)} className="-mx-2 cursor-text rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-left text-[14.5px] leading-relaxed hover:border-line hover:bg-white">
                {t.description ? <span className="whitespace-pre-wrap text-arang-body">{t.description}</span> : <span className="text-arang-faint">Tambahkan deskripsi…</span>}
              </button>
            )}
          </section>

          {/* Subtask */}
          <section className="flex flex-col gap-2.5">
            <SectionTitle right={<button type="button" aria-label="Tambah subtask" className="btn btn-ghost btn-sm" onClick={() => setAddingSub(true)}><Plus size={15} /></button>}>Subtask</SectionTitle>
            {t.subtasks.length > 0 && (
              <div className="flex items-center gap-3"><div className="flex-1"><Progress value={pct(done, t.subtasks.length)} h={6} /></div><span className="shrink-0 text-xs font-semibold text-arang-muted">{pct(done, t.subtasks.length)}% selesai</span></div>
            )}
            <div className="overflow-hidden rounded-lg border border-line bg-white">
              {t.subtasks.map((s, i) => (
                <div key={s.id} className={`group flex min-h-[42px] items-center gap-3 px-3 text-[13.5px] hover:bg-canvas-subtle ${i ? 'border-t border-line-soft' : ''}`}>
                  <input type="checkbox" aria-label={`Selesai: ${s.title}`} checked={s.completed} onChange={() => toggleSubtask(t.id, s.id)} className="h-4 w-4 cursor-pointer" style={{ accentColor: '#0B7A6B' }} />
                  <span className="flex-1" style={{ color: s.completed ? '#8A949B' : '#1F2933', textDecoration: s.completed ? 'line-through' : 'none' }}>{s.title}</span>
                  {s.assigneeId && <Avatar userId={s.assigneeId} size={22} />}
                  <span className="rounded-md px-1.5 py-[2px] text-[11px] font-bold" style={s.completed ? { background: '#E3F3F0', color: '#0B5F54' } : { background: '#ECEEEA', color: '#5B6670' }}>{s.completed ? 'SELESAI' : 'BELUM'}</span>
                  <button type="button" aria-label={`Hapus subtask ${s.title}`} onClick={() => deleteSubtask(t.id, s.id)} className="btn-icon h-7 w-7 border-0 bg-transparent text-arang-muted opacity-0 hover:text-danger group-hover:opacity-100"><Trash2 size={13} /></button>
                </div>
              ))}
              {(addingSub || t.subtasks.length === 0) && (
                <form
                  onSubmit={(e) => { e.preventDefault(); if (sub.trim()) { addSubtask(t.id, sub.trim()); setSub(''); } }}
                  className={`flex items-center gap-2 p-2 ${t.subtasks.length ? 'border-t border-line-soft' : ''}`}
                >
                  <label htmlFor="sub" className="sr-only">Subtask baru</label>
                  <input id="sub" autoFocus={addingSub} className="input input-sm flex-1" placeholder="Apa yang perlu dikerjakan? (Enter untuk menambah)" value={sub} onChange={(e) => setSub(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setAddingSub(false)} />
                  <button type="submit" disabled={!sub.trim()} className="btn btn-primary btn-sm">Tambah</button>
                  {addingSub && t.subtasks.length > 0 && <button type="button" aria-label="Batal" onClick={() => setAddingSub(false)} className="btn btn-ghost btn-sm"><X size={14} /></button>}
                </form>
              )}
            </div>
          </section>

          {/* Lampiran */}
          <section className="flex flex-col gap-2.5">
            <SectionTitle right={<button type="button" aria-label="Unggah lampiran" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}><Plus size={15} /></button>}>Lampiran {t.attachments.length > 0 && <span className="text-arang-muted">({t.attachments.length})</span>}</SectionTitle>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { uploadAttachment(t.id, f); e.target.value = ''; } }} />
            {t.attachments.length === 0 ? (
              <button type="button" onClick={() => fileRef.current?.click()} className="flex h-16 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-transparent text-[13px] text-arang-muted transition-colors hover:border-brand-bright hover:bg-white hover:text-brand">
                <Paperclip size={15} />Seret berkas ke sini atau klik untuk mengunggah
              </button>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {t.attachments.map((a) => (
                  <div key={a.id} className="group flex items-center gap-3 rounded-lg border border-line bg-white p-2.5 shadow-xs">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-canvas text-arang-muted"><Paperclip size={15} /></span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="truncate text-[13px] font-semibold" title={a.name}>{a.name}</div>
                      <div className="flex items-center gap-2 text-[11.5px] text-arang-muted">{a.size}{a.url && <a href={a.url.startsWith('http') ? a.url : `http://localhost:8000${a.url}`} target="_blank" rel="noreferrer" className="font-semibold">Unduh</a>}</div>
                    </div>
                    <button type="button" aria-label={`Hapus lampiran ${a.name}`} onClick={() => deleteAttachment(t.id, a.id)} className="btn-icon h-7 w-7 border-0 bg-transparent text-arang-muted opacity-0 hover:text-danger group-hover:opacity-100"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Tiket terkait (dependensi) */}
          <section className="flex flex-col gap-2.5">
            <SectionTitle>Tiket terkait</SectionTitle>
            {deps.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-line bg-white">
                <div className="bg-canvas-subtle px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-wide text-arang-muted">diblokir oleh</div>
                {deps.map((d) => (
                  <div key={d.id} className="group flex min-h-[40px] items-center gap-3 border-t border-line-soft px-3 text-[13.5px]">
                    <IssueTypeIcon size={15} />
                    <a href={href.tugas(d.id)} className="shrink-0 text-[12.5px] font-semibold">{taskKey(d.id)}</a>
                    <a href={href.tugas(d.id)} className="min-w-0 flex-1 truncate" style={{ color: '#1F2933' }}>{d.title}</a>
                    <PriorityIcon priority={d.priority} />
                    <span className="rounded-md px-1.5 py-[2px] text-[11px] font-bold uppercase" style={{ background: STATUS[d.status].bg, color: STATUS[d.status].fg }}>{STATUS[d.status].label}</span>
                    <button type="button" aria-label={`Lepas tautan ${taskKey(d.id)}`} onClick={() => updateTask(t.id, { dependencies: t.dependencies.filter((x) => x !== d.id) })} className="btn-icon h-7 w-7 border-0 bg-transparent text-arang-muted opacity-0 hover:text-danger group-hover:opacity-100"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            <label htmlFor="dep" className="sr-only">Tambah tiket terkait</label>
            <select id="dep" className="input input-sm max-w-[420px]" value="" onChange={(e) => e.target.value && updateTask(t.id, { dependencies: [...t.dependencies, e.target.value] })}>
              <option value="">+ Tautkan tiket yang harus selesai lebih dulu…</option>
              {tasks.filter((x) => x.projectId === t.projectId && x.id !== t.id && !t.dependencies.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{taskKey(x.id)} · {x.title}</option>)}
            </select>
          </section>

          {/* Aktivitas */}
          <section className="flex flex-col gap-4">
            <SectionTitle>Aktivitas</SectionTitle>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-arang-muted">Tampilkan:</span>
              <div role="tablist" aria-label="Jenis aktivitas" className="flex flex-wrap gap-1">
                {TABS.map((x) => (
                  <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)} className={`h-8 cursor-pointer rounded-md border px-2.5 font-semibold transition-colors ${tab === x.key ? 'border-brand-bright bg-brand-soft text-brand-ink' : 'border-transparent bg-transparent text-arang-body hover:bg-line-soft'}`}>{x.label}</button>
                ))}
              </div>
            </div>

            {(tab === 'comments' || tab === 'all') && (
              <form onSubmit={send} className="flex gap-3">
                <Avatar userId={me.id} size={32} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <label htmlFor="komentar" className="sr-only">Tulis komentar</label>
                  <textarea id="komentar" rows={msg ? 3 : 1} className="input min-h-[40px] resize-y" placeholder="Tambahkan komentar… ketik @nama untuk menyebut rekan." value={msg} onChange={(e) => setMsg(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e as unknown as React.FormEvent); }} />
                  {msg && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="submit" className="btn btn-primary btn-sm">Simpan</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMsg('')}>Batal</button>
                      <span className="text-xs text-arang-muted">Ctrl + Enter untuk menyimpan</span>
                    </div>
                  )}
                  {users.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-arang-muted">
                      <span>Sebut:</span>
                      {users.filter((u) => u.id !== me.id).map((u) => <button key={u.id} type="button" onClick={() => mention(u.shortName)} className="cursor-pointer rounded-full border border-line bg-white px-2 py-0.5 text-arang-body hover:bg-brand-soft">@{u.shortName}</button>)}
                    </div>
                  )}
                </div>
              </form>
            )}

            <div className="flex flex-col gap-5">
              {tab === 'all' && (feed.length ? feed.map((f) => (f.kind === 'comment' ? commentItem(f.id, f.userId, f.at, f.text) : historyItem(f.id, f.userId, f.at, f.text))) : <span className="text-sm text-arang-muted">Belum ada aktivitas.</span>)}
              {tab === 'comments' && (cs.length ? [...cs].reverse().map((c) => commentItem(c.id, c.userId, c.createdAt, c.content)) : <span className="text-sm text-arang-muted">Belum ada komentar untuk tiket ini.</span>)}
              {tab === 'history' && (
                <>
                  {acts.length ? acts.map((a) => historyItem(a.id, a.userId, a.createdAt, a.text)) : <span className="text-sm text-arang-muted">Belum ada catatan aktivitas.</span>}
                  <span className="text-xs text-arang-muted">Tiket dibuat oleh <strong>{user(t.createdBy).name}</strong> pada {fmtDate(t.createdAt.slice(0, 10))}.</span>
                </>
              )}
              {tab === 'worklog' && (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-line bg-white px-3 py-2.5 text-sm"><span className="font-semibold">Total tercatat</span><span className="tabular font-bold text-brand">{fmtDuration(logged)}</span></div>
                  {!tLogs.length && <span className="text-sm text-arang-muted">Belum ada catatan waktu. Gunakan timer di panel kanan untuk mulai mencatat.</span>}
                  {tLogs.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 text-[13.5px]">
                      <Avatar userId={entry.userId} size={32} />
                      <div className="min-w-0 flex-1"><strong className="font-semibold">{user(entry.userId).name}</strong> mencatat <strong className="tabular">{fmtDuration(entry.durationSeconds)}</strong><div className="text-xs text-arang-muted">{entry.date}{entry.note ? ` · ${entry.note}` : ''}</div></div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>
        </article>

        {/* ─────────── Panel kanan ─────────── */}
        <aside aria-label="Detail tiket" className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[72px]">
          <div className="flex items-center gap-2">
            <label htmlFor="status-select" className="sr-only">Status</label>
            <div className="relative">
              <select
                id="status-select"
                aria-label="Status"
                value={t.status}
                onChange={(e) => moveTask(t.id, e.target.value as TaskStatus)}
                className="h-9 cursor-pointer appearance-none rounded-lg border-0 py-0 pl-3 pr-8 text-[13.5px] font-bold uppercase tracking-wide outline-none shadow-xs"
                style={{ background: st.bg, color: st.fg }}
              >
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-[11px]" style={{ color: st.fg }} />
            </div>
            {t.status !== 'done' && <button type="button" className="btn btn-outline btn-sm" onClick={() => moveTask(t.id, 'done')}><Check size={14} />Tandai rampung</button>}
          </div>

          <Panel title="Detail">
            <Field label="Penanggung jawab">
              <Avatar userId={t.assigneeId} size={24} />
              <select aria-label="Penanggung jawab" className={ghost} value={t.assigneeId} onChange={(e) => updateTask(t.id, { assigneeId: e.target.value })}>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Pelapor"><Avatar userId={t.createdBy} size={24} /><span className="truncate px-1.5">{user(t.createdBy).name}</span></Field>
            <Field label="Prioritas">
              <PriorityIcon priority={t.priority} />
              <select aria-label="Prioritas" className={ghost} value={t.priority} onChange={(e) => updateTask(t.id, { priority: e.target.value as Priority })}>
                {(Object.keys(PRIORITY) as Priority[]).map((x) => <option key={x} value={x}>{PRIORITY[x].label}</option>)}
              </select>
            </Field>
            <Field label="Label">
              <select aria-label="Label" className={ghost} value={t.label} onChange={(e) => updateTask(t.id, { label: e.target.value })}>
                {Object.keys(LABELS).map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Tanggal mulai"><input aria-label="Tanggal mulai" type="date" className={ghost} value={t.startDate} onChange={(e) => e.target.value && updateTask(t.id, { startDate: e.target.value })} /></Field>
            <Field label="Tenggat">
              <input aria-label="Tenggat" type="date" className={ghost} value={t.dueDate} onChange={(e) => e.target.value && updateTask(t.id, { dueDate: e.target.value })} />
            </Field>
            <div className="-mt-1 pb-1 pl-[146px] text-xs font-semibold" style={{ color: late ? '#B42318' : '#5B6670' }}>{fmtDue(t.dueDate, t.status === 'done')}</div>
            <Field label="Estimasi">
              <input aria-label="Estimasi jam" type="number" min={0} className={`${ghost} w-20`} value={t.estimatedHours ?? ''} placeholder="–" onChange={(e) => updateTask(t.id, { estimatedHours: e.target.value ? Number(e.target.value) : undefined })} />
              <span className="text-arang-muted">jam</span>
            </Field>
            {t.isMilestone && <Field label="Jenis"><span className="rounded-md bg-kunyit-soft px-1.5 py-[2px] text-[11px] font-bold" style={{ color: '#6B4A00' }}>Milestone</span></Field>}
            <Field label="Pengamat">
              {t.watcherIds.length ? <span className="flex">{t.watcherIds.map((id, i) => <span key={id} style={{ marginLeft: i ? -6 : 0 }}><Avatar userId={id} size={24} ring /></span>)}</span> : <span className="px-1.5 text-arang-muted">Belum ada</span>}
            </Field>
            <Field label="Proyek">{p ? <a href={href.proyek(p.id)} className="truncate px-1.5 font-semibold">{p.name}</a> : '–'}</Field>
          </Panel>

          <Panel title="Pelacakan waktu">
            {workspace.enabledModules.timeTracking ? (
              <div className="flex flex-col gap-3 py-2">
                <div className="flex items-center gap-2 text-arang-muted"><Clock size={15} /><Progress value={estSeconds ? (logged / estSeconds) * 100 : logged ? 100 : 0} h={6} /></div>
                <div className="flex justify-between text-xs text-arang-muted"><span><strong className="tabular text-arang">{fmtDuration(logged)}</strong> tercatat</span><span>{t.estimatedHours ? `estimasi ${t.estimatedHours} j` : 'tanpa estimasi'}</span></div>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2">
                  <span className="tabular flex items-center gap-2 text-xl font-bold">{running && <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />}{fmtClock(running ? timerSeconds : 0)}</span>
                  <button type="button" onClick={() => (running ? stopTimer() : startTimer(t.id))} className={`btn btn-sm ${running ? 'btn-outline' : 'btn-kunyit'}`}>
                    {running ? <><Square size={13} />Hentikan</> : <><Play size={13} />Mulai timer</>}
                  </button>
                </div>
              </div>
            ) : (
              <span className="py-2 text-[13px] text-arang-muted">Aktifkan modul Time Tracking di Toko modul untuk mencatat jam kerja per tugas.</span>
            )}
          </Panel>

          <div className="px-1 text-xs leading-relaxed text-arang-muted">
            Dibuat {timeAgo(t.createdAt).toLowerCase()} · Diperbarui {timeAgo(t.updatedAt).toLowerCase()}
          </div>
        </aside>
      </div>
    </div>
  );
};
