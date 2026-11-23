import React, { useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, CheckSquare, Clock, Copy, FileText, History, Link2, MessageSquare, Paperclip, Play, Plus, Square, Trash2, UserCheck, X } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { go, href } from '../store/router';
import type { Priority, TaskStatus } from '../types';
import { Avatar, Empty, LabelPill, Pill, Progress, StatusPill } from '../components/ui';
import { LABELS, PRIORITY, STATUS, STATUS_ORDER } from '../lib/meta';
import { fmtClock, fmtDate, fmtDue, fmtDuration, formatTaskKey, isOverdue, pct, timeAgo } from '../lib/format';

export const TaskPage: React.FC<{ taskId: string }> = ({ taskId }) => {
  const {
    tasks,
    projects,
    comments,
    activities,
    timeEntries,
    users,
    user,
    me,
    updateTask,
    deleteTask,
    moveTask,
    toggleSubtask,
    addSubtask,
    deleteSubtask,
    addComment,
    addAttachment,
    deleteAttachment,
    uploadAttachment,
    timer,
    timerSeconds,
    startTimer,
    stopTimer,
    workspace,
    notify,
  } = useApp();

  const [msg, setMsg] = useState('');
  const [sub, setSub] = useState('');
  const [editDesc, setEditDesc] = useState(false);
  const [activeTab, setActiveTab] = useState<'comments' | 'history' | 'worklog'>('comments');
  const [copiedKey, setCopiedKey] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const t = tasks.find((x) => x.id === taskId);
  if (!t) return <Empty title="Tugas tidak ditemukan" text="Tugas ini mungkin sudah dihapus."><a className="btn btn-primary" href={href.tugasSaya}>Ke Tugas Saya</a></Empty>;

  const p = projects.find((x) => x.id === t.projectId);
  const key = formatTaskKey(t.id, p?.shortName);
  const cs = comments.filter((c) => c.taskId === t.id);
  const acts = activities.filter((a) => a.taskId === t.id || (t.title && a.text.includes(t.title)));
  const tLogs = timeEntries.filter((e) => e.taskId === t.id);
  const done = t.subtasks.filter((s) => s.completed).length;
  const running = timer?.taskId === t.id;
  const logged = t.loggedSeconds + (running ? timerSeconds : 0);
  const deps = t.dependencies.map((id) => tasks.find((x) => x.id === id)).filter(Boolean) as typeof tasks;
  const blockers = deps.filter((d) => d.status !== 'done');
  const late = isOverdue(t.dueDate, t.status === 'done');

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

  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-8">
      {/* Jira-style Breadcrumb & Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-4">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-arang-muted">
          <a href={p ? href.proyek(p.id) : href.beranda} className="inline-flex items-center gap-1 font-semibold hover:text-brand transition-colors">
            <ArrowLeft size={14} />
            Board
          </a>
          <span>/</span>
          {p && (
            <>
              <a href={href.proyek(p.id)} className="hover:text-brand transition-colors font-medium">
                {p.name}
              </a>
              <span>/</span>
            </>
          )}
          <button
            type="button"
            onClick={copyKey}
            title="Klik untuk salin issue key"
            className="inline-flex items-center gap-1 font-mono font-bold text-xs bg-line-soft hover:bg-line-strong text-arang px-2 py-0.5 rounded transition-colors"
          >
            {key}
            {copiedKey ? <Check size={12} className="text-brand" /> : <Copy size={11} className="text-arang-muted" />}
          </button>
        </div>

        {/* Quick action tools */}
        <div className="flex flex-wrap items-center gap-2">
          {t.assigneeId !== me.id && (
            <button
              type="button"
              className="btn btn-outline btn-sm gap-1"
              onClick={() => {
                updateTask(t.id, { assigneeId: me.id });
                notify('Ditugaskan ke Anda', t.title, 'success');
              }}
            >
              <UserCheck size={14} />
              Tugaskan ke saya
            </button>
          )}

          {/* Jira-style Workflow Transition Bar */}
          <div className="flex items-center gap-1 bg-line-soft p-1 rounded-lg">
            {STATUS_ORDER.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => moveTask(t.id, st)}
                className={`px-2.5 py-1 text-xs rounded transition-all ${
                  t.status === st
                    ? 'bg-white text-arang font-bold shadow-sm'
                    : 'text-arang-muted hover:text-arang'
                }`}
              >
                {STATUS[st].label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
              notify('Tautan disalin', undefined, 'success');
            }}
          >
            <Link2 size={14} />
            Tautan
          </button>
          <button
            type="button"
            aria-label="Hapus tugas"
            className="btn-icon p-1.5 text-red-500 hover:bg-red-50"
            onClick={() => {
              if (window.confirm(`Hapus tiket "${key}: ${t.title}"?`)) {
                deleteTask(t.id);
                go(p ? href.proyek(p.id) : href.beranda);
              }
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <article className="card flex min-w-0 flex-[999_1_480px] flex-col gap-6 p-5 sm:p-7">
          {/* Title & Top Badges */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-arang-muted bg-canvas px-2 py-0.5 rounded border border-line-soft">{key}</span>
              <StatusPill status={t.status} />
              <LabelPill label={t.label} />
              {t.priority === 'high' && <Pill bg="#FDECEA" fg="#B42318" className="font-bold">Prioritas tinggi</Pill>}
              {t.isMilestone && <Pill bg="#1F2933" fg="#fff">Milestone</Pill>}
            </div>
            <label htmlFor="judul" className="sr-only">Judul tugas</label>
            <input
              id="judul"
              value={t.title}
              onChange={(e) => updateTask(t.id, { title: e.target.value })}
              className="w-full border-0 bg-transparent p-0 text-[26px] font-extrabold tracking-[-0.3px] outline-none hover:bg-canvas rounded px-1 -mx-1 transition-colors"
            />
          </div>

          {/* Description */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="m-0 text-[15px] font-bold">Deskripsi</h2>
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent text-[13px] font-semibold text-brand"
                onClick={() => setEditDesc(!editDesc)}
              >
                {editDesc ? 'Selesai' : 'Ubah'}
              </button>
            </div>
            {editDesc ? (
              <textarea
                aria-label="Deskripsi"
                className="input min-h-[110px]"
                value={t.description}
                onChange={(e) => updateTask(t.id, { description: e.target.value })}
              />
            ) : (
              <p className="m-0 text-[15px] leading-relaxed text-arang-body whitespace-pre-wrap">
                {t.description || 'Belum ada deskripsi. Klik "Ubah" untuk menambahkan detail tugas.'}
              </p>
            )}
          </section>

          {/* Trello Checklist / Subtasks */}
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare size={16} className="text-brand" />
                <h2 className="m-0 text-[15px] font-bold">Subtask / Checklist</h2>
              </div>
              <span className="text-[13px] font-semibold text-arang-muted">{done} dari {t.subtasks.length} ({pct(done, t.subtasks.length)}%) rampung</span>
            </div>
            <Progress value={pct(done, t.subtasks.length)} h={5} />
            <div className="flex flex-col gap-1.5 pt-1">
              {t.subtasks.map((s) => (
                <div
                  key={s.id}
                  className="group flex min-h-[42px] items-center justify-between gap-3 rounded-[10px] border border-line-soft px-3 text-sm hover:border-brand-soft hover:bg-canvas transition-colors"
                >
                  <label className="flex flex-1 items-center gap-3 cursor-pointer py-2">
                    <input
                      type="checkbox"
                      checked={s.completed}
                      onChange={() => toggleSubtask(t.id, s.id)}
                      className="h-[18px] w-[18px] rounded cursor-pointer"
                      style={{ accentColor: '#0B7A6B' }}
                    />
                    <span
                      className="flex-1 text-[13px]"
                      style={{
                        color: s.completed ? '#8A949B' : '#1F2933',
                        textDecoration: s.completed ? 'line-through' : 'none',
                      }}
                    >
                      {s.title}
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    {s.assigneeId && <span className="text-xs text-arang-muted font-medium">{user(s.assigneeId).shortName}</span>}
                    <button
                      type="button"
                      title="Hapus subtask"
                      onClick={() => deleteSubtask(t.id, s.id)}
                      className="opacity-0 group-hover:opacity-100 btn-icon p-1 text-arang-muted hover:text-red-600 transition-opacity"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (sub.trim()) {
                  addSubtask(t.id, sub.trim());
                  setSub('');
                }
              }}
              className="flex gap-2 pt-1"
            >
              <label htmlFor="sub" className="sr-only">Subtask baru</label>
              <input
                id="sub"
                className="input input-sm h-10 flex-1 text-xs"
                placeholder="Tambah subtask / checklist baru... (Enter)"
                value={sub}
                onChange={(e) => setSub(e.target.value)}
              />
              <button type="submit" disabled={!sub.trim()} className="btn btn-outline btn-sm">
                Tambah
              </button>
            </form>
          </section>

          {/* Attachments */}
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Paperclip size={16} className="text-brand" />
                <h2 className="m-0 text-[15px] font-bold">Lampiran Berkas ({t.attachments.length})</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {t.attachments.map((a) => (
                <div
                  key={a.id}
                  className="group relative flex flex-col justify-between rounded-[10px] border border-line bg-line-soft p-3 text-xs text-arang-body hover:bg-white hover:border-brand-bright transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-arang truncate" title={a.name}>
                      {a.name}
                    </span>
                    <button
                      type="button"
                      title="Hapus lampiran"
                      onClick={() => deleteAttachment(t.id, a.id)}
                      className="opacity-0 group-hover:opacity-100 btn-icon p-1 text-arang-muted hover:text-red-600 transition-opacity"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-arang-muted">
                    <span>{a.size}</span>
                    {a.url && (
                      <a
                        href={a.url.startsWith('http') ? a.url : `http://localhost:8000${a.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-brand hover:underline"
                      >
                        Unduh
                      </a>
                    )}
                  </div>
                </div>
              ))}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    uploadAttachment(t.id, f);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-24 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-dashed border-line-strong bg-transparent text-[13px] text-arang-muted hover:border-brand hover:text-brand transition-colors"
              >
                <Plus size={16} />
                Unggah berkas baru
              </button>
            </div>
          </section>

          {/* Jira-style Tabbed Activity Section */}
          <section className="flex flex-col gap-3.5 border-t border-line-soft pt-4">
            <div className="flex items-center gap-2 border-b border-line-soft pb-2 text-sm font-semibold">
              <span className="text-arang-muted mr-1">Aktivitas:</span>
              <button
                type="button"
                onClick={() => setActiveTab('comments')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-0 cursor-pointer transition-colors ${
                  activeTab === 'comments' ? 'bg-line-soft font-bold text-arang' : 'bg-transparent text-arang-muted hover:text-arang'
                }`}
              >
                <MessageSquare size={14} />
                Komentar ({cs.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-0 cursor-pointer transition-colors ${
                  activeTab === 'history' ? 'bg-line-soft font-bold text-arang' : 'bg-transparent text-arang-muted hover:text-arang'
                }`}
              >
                <History size={14} />
                Riwayat ({acts.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('worklog')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-0 cursor-pointer transition-colors ${
                  activeTab === 'worklog' ? 'bg-line-soft font-bold text-arang' : 'bg-transparent text-arang-muted hover:text-arang'
                }`}
              >
                <Clock size={14} />
                Log Waktu ({tLogs.length})
              </button>
            </div>

            {/* Tab: Comments */}
            {activeTab === 'comments' && (
              <div className="flex flex-col gap-4">
                {!cs.length && <span className="py-2 text-sm text-arang-muted">Belum ada komentar untuk tiket ini.</span>}
                {cs.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar userId={c.userId} size={32} />
                    <div className="flex flex-1 flex-col gap-1 rounded-xl bg-canvas p-3 border border-line-soft text-sm leading-relaxed">
                      <div className="flex items-center justify-between">
                        <strong className="text-arang font-semibold">{user(c.userId).name}</strong>
                        <span className="text-xs text-arang-muted">{timeAgo(c.createdAt)}</span>
                      </div>
                      <span className="text-arang-body whitespace-pre-wrap">{renderMsg(c.content)}</span>
                    </div>
                  </div>
                ))}
                <form onSubmit={send} className="flex flex-col gap-2 pt-2">
                  <div className="flex gap-2">
                    <label htmlFor="komentar" className="sr-only">Tulis komentar</label>
                    <input
                      id="komentar"
                      className="input h-11 min-w-0 flex-1 text-sm"
                      placeholder="Tulis komentar... Gunakan @nama untuk menyebut rekan tim."
                      value={msg}
                      onChange={(e) => setMsg(e.target.value)}
                    />
                    <button type="submit" disabled={!msg.trim()} className="btn btn-primary">
                      Kirim
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-arang-muted">
                    <span>Sebut:</span>
                    {users.filter((u) => u.id !== me.id).map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => mention(u.shortName)}
                        className="cursor-pointer rounded-full border border-line bg-white px-2 py-0.5 text-arang-body hover:bg-brand-soft hover:text-brand"
                      >
                        @{u.shortName}
                      </button>
                    ))}
                  </div>
                </form>
              </div>
            )}

            {/* Tab: History */}
            {activeTab === 'history' && (
              <div className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-arang-muted">
                {!acts.length && <span className="py-2 text-sm text-arang-muted">Belum ada catatan aktivitas.</span>}
                {acts.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 border-b border-line-soft pb-2">
                    <Avatar userId={a.userId} size={22} />
                    <span className="flex-1 text-arang">
                      <strong>{user(a.userId).name}</strong> {a.text}
                    </span>
                    <span className="text-xs text-arang-muted">{timeAgo(a.createdAt)}</span>
                  </div>
                ))}
                <span className="text-xs pt-1">
                  Tiket dibuat oleh <strong>{user(t.createdBy).name}</strong> pada {fmtDate(t.createdAt.slice(0, 10))}
                </span>
              </div>
            )}

            {/* Tab: Worklog */}
            {activeTab === 'worklog' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between rounded-xl bg-canvas p-3 border border-line-soft text-sm">
                  <span className="font-semibold text-arang">Total Jam Tercatat:</span>
                  <span className="font-mono font-extrabold text-brand text-base">{fmtDuration(logged)}</span>
                </div>
                {!tLogs.length && <span className="py-2 text-sm text-arang-muted">Belum ada catatan waktu individual di tiket ini. Gunakan widget timer di panel kanan untuk mulai mencatat.</span>}
                {tLogs.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-lg border border-line-soft p-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Avatar userId={entry.userId} size={24} />
                      <div>
                        <div className="font-semibold text-arang">{user(entry.userId).name}</div>
                        <div className="text-arang-muted">{entry.date} {entry.note ? `· ${entry.note}` : ''}</div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-arang text-sm">{fmtDuration(entry.durationSeconds)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </article>

        {/* Jira-style Right Sidebar Panel */}
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <section className="card flex flex-col gap-3.5 p-5 text-sm">
            <h2 className="m-0 text-[15px] font-bold">Detail Tiket</h2>
            <Row label="Status">
              <select
                aria-label="Status"
                className="input input-sm w-auto font-semibold"
                value={t.status}
                onChange={(e) => moveTask(t.id, e.target.value as TaskStatus)}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{STATUS[s].label}</option>
                ))}
              </select>
            </Row>
            <Row label="Penanggung jawab">
              <select
                aria-label="Penanggung jawab"
                className="input input-sm w-auto"
                value={t.assigneeId}
                onChange={(e) => updateTask(t.id, { assigneeId: e.target.value })}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </Row>
            <Row label="Pelapor / Pembuat">
              <span className="font-semibold text-xs text-arang">{user(t.createdBy).name}</span>
            </Row>
            <Row label="Prioritas">
              <select
                aria-label="Prioritas"
                className="input input-sm w-auto font-semibold"
                value={t.priority}
                onChange={(e) => updateTask(t.id, { priority: e.target.value as Priority })}
              >
                {(Object.keys(PRIORITY) as Priority[]).map((x) => (
                  <option key={x} value={x}>{PRIORITY[x].label}</option>
                ))}
              </select>
            </Row>
            <Row label="Label">
              <select
                aria-label="Label"
                className="input input-sm w-auto font-semibold"
                value={t.label}
                onChange={(e) => updateTask(t.id, { label: e.target.value })}
              >
                {Object.keys(LABELS).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Row>
            <Row label="Mulai">
              <input
                aria-label="Tanggal mulai"
                type="date"
                className="input input-sm w-auto"
                value={t.startDate}
                onChange={(e) => e.target.value && updateTask(t.id, { startDate: e.target.value })}
              />
            </Row>
            <Row label="Tenggat">
              <input
                aria-label="Tenggat"
                type="date"
                className="input input-sm w-auto"
                value={t.dueDate}
                onChange={(e) => e.target.value && updateTask(t.id, { dueDate: e.target.value })}
              />
            </Row>
            <div className="-mt-1 text-right text-xs font-semibold" style={{ color: late ? '#B42318' : '#5B6670' }}>
              {fmtDue(t.dueDate, t.status === 'done')}
            </div>
            <Row label="Estimasi">
              <span className="flex items-center gap-1.5">
                <input
                  aria-label="Estimasi jam"
                  type="number"
                  min={0}
                  className="input input-sm w-[72px]"
                  value={t.estimatedHours ?? ''}
                  onChange={(e) => updateTask(t.id, { estimatedHours: e.target.value ? Number(e.target.value) : undefined })}
                />
                jam
              </span>
            </Row>
            <Row label="Proyek">
              <a href={p ? href.proyek(p.id) : '#'} className="font-semibold text-brand hover:underline">
                {p?.shortName}
              </a>
            </Row>
            <Row label="Pengamat">
              <span className="font-semibold text-xs text-arang-body">
                {t.watcherIds.length ? t.watcherIds.map((id) => user(id).shortName).join(', ') : '–'}
              </span>
            </Row>
          </section>

          {/* Time Tracking Widget */}
          {workspace.enabledModules.timeTracking ? (
            <section className="flex flex-col gap-3 rounded-card bg-arang p-5 text-white" style={{ color: '#fff' }}>
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold" style={{ color: '#C9D1D6' }}>Time Tracking</span>
                {running && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
              </div>
              <span className="tabular text-4xl font-extrabold tracking-wide">{fmtClock(running ? timerSeconds : 0)}</span>
              <span className="text-[13px]" style={{ color: '#C9D1D6' }}>
                Total tercatat {fmtDuration(logged)}{t.estimatedHours ? ` dari estimasi ${t.estimatedHours} j` : ''}
              </span>
              <button
                type="button"
                onClick={() => (running ? stopTimer() : startTimer(t.id))}
                className="btn btn-kunyit"
              >
                {running ? <><Square size={14} />Hentikan & simpan</> : <><Play size={14} />Mulai timer</>}
              </button>
            </section>
          ) : (
            <section className="card flex flex-col gap-2 p-5 text-sm">
              <h2 className="m-0 text-[15px] font-bold">Time tracking</h2>
              <span className="text-arang-muted">Aktifkan modul Time Tracking di Toko modul untuk mencatat jam kerja per tugas.</span>
            </section>
          )}

          {/* Dependencies */}
          <section className="card flex flex-col gap-2.5 p-5 text-sm">
            <h2 className="m-0 text-[15px] font-bold">Dependensi Tiket</h2>
            {!deps.length && <span className="text-arang-muted">Tidak bergantung pada tugas lain.</span>}
            {!!blockers.length && <span className="text-arang-muted font-semibold text-xs text-amber-700">Menunggu tugas ini selesai:</span>}
            {deps.map((d) => (
              <a
                key={d.id}
                href={href.tugas(d.id)}
                className="flex items-center justify-between rounded-[10px] border border-line-soft px-3 py-2 font-semibold text-xs hover:border-brand transition-colors"
                style={{ color: '#1F2933' }}
              >
                <span className="truncate mr-2">{d.title}</span>
                <span className="text-xs shrink-0" style={{ color: d.status === 'done' ? '#0B5F54' : '#8A5A00' }}>
                  {STATUS[d.status].label}
                </span>
              </a>
            ))}
            <label htmlFor="dep" className="sr-only">Tambah dependensi</label>
            <select
              id="dep"
              className="input input-sm text-xs"
              value=""
              onChange={(e) => e.target.value && updateTask(t.id, { dependencies: [...t.dependencies, e.target.value] })}
            >
              <option value="">+ Tambah dependensi...</option>
              {tasks.filter((x) => x.projectId === t.projectId && x.id !== t.id && !t.dependencies.includes(x.id)).map((x) => (
                <option key={x.id} value={x.id}>{x.title}</option>
              ))}
            </select>
          </section>
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3"><span className="text-arang-muted">{label}</span>{children}</div>
);
