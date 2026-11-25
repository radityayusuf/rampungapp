import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, CheckSquare, ChevronLeft, ChevronRight, Download, MessageSquare, Paperclip, Plus, Search, Sparkles, X, Zap } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useIsMobile } from '../lib/useMedia';
import { href } from '../store/router';
import type { ProjectView, Task, TaskStatus } from '../types';
import { Avatar, Empty, IssueTypeIcon, LabelPill, Modal, Pill, PriorityIcon, PriorityText, Progress, StatusPill } from '../components/ui';
import { PROJECT_VIEWS } from '../components/AppShell';
import { PRIORITY, STATUS, STATUS_ORDER } from '../lib/meta';
import { BULAN_PANJANG, HARI, addDays, diffDays, exportCsv, fmtDue, fmtDate, isOverdue, parseISODate, pct, todayISO, toISODate, errMsg } from '../lib/format';
import { api, AiSummarizeResult } from '../lib/api';


const subDone = (t: Task) => t.subtasks.filter((s) => s.completed).length;
const taskPct = (t: Task) => (t.status === 'done' ? 100 : pct(subDone(t), t.subtasks.length));

/* ---------------- Kanban ---------------- */
const Card: React.FC<{ t: Task; onDragStart: (id: string) => void }> = ({ t, onDragStart }) => {
  const { comments, taskKey } = useApp();
  const late = isOverdue(t.dueDate, t.status === 'done');
  const commentCount = comments.filter((c) => c.taskId === t.id).length;
  const key = taskKey(t.id);

  return (
    <a
      href={href.tugas(t.id)}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); onDragStart(t.id); }}
      className="group flex cursor-grab flex-col gap-2.5 rounded-lg border border-line bg-white p-3 text-arang shadow-card transition-all duration-150 hover:border-line-strong hover:shadow-lift active:cursor-grabbing"
      style={{ color: '#1F2933' }}
    >
      <span className="line-clamp-3 text-[13.5px] font-medium leading-snug">{t.title}</span>

      {(t.label || t.isMilestone) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {t.label && <LabelPill label={t.label} />}
          {t.isMilestone && <span className="rounded-md bg-kunyit-soft px-1.5 py-[2px] text-[11px] font-bold" style={{ color: '#6B4A00' }}>Milestone</span>}
        </div>
      )}

      {t.subtasks.length > 0 && <Progress value={taskPct(t)} h={3} />}

      <div className="flex items-center justify-between gap-2 text-xs text-arang-muted">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><IssueTypeIcon milestone={t.isMilestone} /><span className="text-[12px] font-semibold tracking-tight text-arang-muted group-hover:text-brand">{key}</span></span>
          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${t.status === 'done' ? 'bg-brand-soft text-brand-ink' : late ? 'bg-danger-soft text-danger' : 'bg-canvas text-arang-muted'}`}>
            <CalendarIcon size={11} />{fmtDue(t.dueDate, t.status === 'done')}
          </span>
          {t.subtasks.length > 0 && <span className={`inline-flex items-center gap-1 text-[11px] ${subDone(t) === t.subtasks.length ? 'font-bold text-brand' : ''}`} title="Subtask selesai"><CheckSquare size={12} />{subDone(t)}/{t.subtasks.length}</span>}
          {t.attachments.length > 0 && <span className="inline-flex items-center gap-0.5 text-[11px]" title="Lampiran"><Paperclip size={12} />{t.attachments.length}</span>}
          {commentCount > 0 && <span className="inline-flex items-center gap-0.5 text-[11px]" title="Komentar"><MessageSquare size={12} />{commentCount}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2"><PriorityIcon priority={t.priority} /><Avatar userId={t.assigneeId} size={24} /></div>
      </div>
    </a>
  );
};

const InlineCreateCard: React.FC<{ projectId: string; status: TaskStatus; onDone: () => void }> = ({ projectId, status, onDone }) => {
  const { createTask } = useApp();
  const [title, setTitle] = useState('');

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) return;
    createTask({ projectId, title: title.trim(), status });
    setTitle('');
    onDone();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-[10px] border border-brand bg-white p-2.5 shadow-sm">
      <textarea
        autoFocus
        placeholder="Ketik judul kartu / tugas baru..."
        className="input min-h-[60px] p-2 text-xs resize-none"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            onDone();
          }
        }}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button type="submit" disabled={!title.trim()} className="btn btn-primary btn-sm py-1 px-3 text-xs">
            Tambah
          </button>
          <button type="button" onClick={onDone} className="btn btn-outline btn-sm py-1 px-2 text-xs">
            <X size={14} />
          </button>
        </div>
        <span className="text-[10px] text-arang-muted">Enter untuk simpan</span>
      </div>
    </form>
  );
};

const MobileBoard: React.FC<{ tasks: Task[]; projectId: string }> = ({ tasks, projectId }) => {
  const [col, setCol] = useState<TaskStatus>('in_progress');
  const [adding, setAdding] = useState(false);
  const list = tasks.filter((t) => t.status === col);
  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <div role="tablist" aria-label="Kolom board" className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {STATUS_ORDER.map((s) => {
          const on = s === col;
          return (
            <button key={s} type="button" role="tab" aria-selected={on} onClick={() => { setCol(s); setAdding(false); }} className="h-10 shrink-0 cursor-pointer rounded-full px-3.5 text-sm font-semibold" style={{ border: `1px solid ${on ? '#1F2933' : '#E2E5E1'}`, background: on ? '#1F2933' : '#fff', color: on ? '#fff' : '#1F2933' }}>
              {STATUS[s].label} · {tasks.filter((t) => t.status === s).length}
            </button>
          );
        })}
      </div>
      {list.map((t) => (
        <Card key={t.id} t={t} onDragStart={() => undefined} />
      ))}
      {!list.length && <Empty title="Kolom kosong" text="Belum ada tugas di kolom ini." />}
      {adding ? (
        <InlineCreateCard projectId={projectId} status={col} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="h-12 cursor-pointer rounded-card border border-dashed border-line-strong bg-transparent text-sm text-arang-muted">+ Tambah kartu ke kolom ini</button>
      )}
    </div>
  );
};

const Kanban: React.FC<{ tasks: Task[]; projectId: string }> = ({ tasks, projectId }) => {
  const { moveTask } = useApp();
  const mobile = useIsMobile();
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [addingCol, setAddingCol] = useState<TaskStatus | null>(null);

  if (mobile) return <MobileBoard tasks={tasks} projectId={projectId} />;
  return (
    <div className="flex items-start gap-3 overflow-x-auto px-4 pb-8 pt-4 sm:px-8">
      {STATUS_ORDER.map((st) => {
        const list = tasks.filter((t) => t.status === st);
        return (
          <section
            key={st}
            aria-label={STATUS[st].label}
            onDragOver={(e) => { e.preventDefault(); setOver(st); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || dragId; if (id) moveTask(id, st); setOver(null); setDragId(null); }}
            className="flex w-[266px] shrink-0 flex-col gap-2 rounded-xl bg-[#F0F2EE] p-2 transition-shadow"
            style={over === st ? { boxShadow: 'inset 0 0 0 2px #0F9D8A', background: '#E6F4F1' } : undefined}
          >
            <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
              <div className="flex items-center gap-2">
                <h2 className="m-0 text-[11.5px] font-bold uppercase tracking-[0.07em] text-arang-muted">{STATUS[st].label}</h2>
                <span className="rounded-full bg-white/80 px-1.5 text-[11px] font-bold text-arang-muted">{list.length}</span>
              </div>
              <button type="button" aria-label={`Tambah tugas di ${STATUS[st].label}`} onClick={() => setAddingCol(st)} className="btn-icon h-7 w-7 border-0 bg-transparent hover:bg-white"><Plus size={15} /></button>
            </div>
            {list.map((t) => <Card key={t.id} t={t} onDragStart={setDragId} />)}
            {addingCol === st ? (
              <InlineCreateCard projectId={projectId} status={st} onDone={() => setAddingCol(null)} />
            ) : (
              <button type="button" onClick={() => setAddingCol(st)} className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 text-[13px] text-arang-muted hover:bg-white hover:text-arang"><Plus size={14} />Tambah tugas</button>
            )}
          </section>
        );
      })}
    </div>
  );
};

/* ---------------- List (gaya daftar Jira) ---------------- */
type SortKey = 'key' | 'title' | 'status' | 'assignee' | 'priority' | 'due' | 'created';
const PRIO_RANK: Record<Task['priority'], number> = { high: 0, medium: 1, low: 2 };
/** Kontrol pilih yang tampil seperti teks sampai disorot (gaya sunting di tempat Jira). */
const ghostSel = 'h-8 max-w-full cursor-pointer rounded-md border border-transparent bg-transparent px-1.5 text-[13px] text-arang outline-none hover:border-line hover:bg-white focus:border-brand-bright focus:bg-white';

const ListView: React.FC<{ tasks: Task[]; projectId: string }> = ({ tasks, projectId }) => {
  const { users, user, taskKey, moveTask, updateTask, createTask } = useApp();
  const [group, setGroup] = useState<'none' | 'status' | 'orang'>('none');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'key', dir: -1 });
  const [title, setTitle] = useState('');
  const num = (t: Task) => Number(taskKey(t.id).split('-').pop()) || 0;
  const cmp = (x: Task, y: Task) => {
    const v = (() => {
      switch (sort.k) {
        case 'title': return x.title.localeCompare(y.title);
        case 'status': return STATUS_ORDER.indexOf(x.status) - STATUS_ORDER.indexOf(y.status);
        case 'assignee': return user(x.assigneeId).name.localeCompare(user(y.assigneeId).name);
        case 'priority': return PRIO_RANK[x.priority] - PRIO_RANK[y.priority];
        case 'due': return x.dueDate.localeCompare(y.dueDate);
        case 'created': return x.createdAt.localeCompare(y.createdAt);
        default: return num(x) - num(y);
      }
    })();
    return v * sort.dir;
  };
  const sorted = [...tasks].sort(cmp);
  const groups = group === 'none'
    ? [{ key: 'all', name: '', rows: sorted }]
    : group === 'status'
      ? STATUS_ORDER.map((s) => ({ key: s, name: STATUS[s].label, rows: sorted.filter((t) => t.status === s) }))
      : users.map((u) => ({ key: u.id, name: u.name, rows: sorted.filter((t) => t.assigneeId === u.id) }));

  const Th: React.FC<{ k?: SortKey; children: React.ReactNode; className?: string }> = ({ k, children, className = '' }) => (
    <th scope="col" aria-sort={k && sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined} className={`whitespace-nowrap px-3 py-2.5 text-left text-[12px] font-semibold text-arang-muted ${className}`}>
      {k ? (
        <button type="button" onClick={() => setSort((cur) => ({ k, dir: cur.k === k ? (cur.dir === 1 ? -1 : 1) : 1 }))} className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-semibold text-arang-muted hover:text-arang">
          {children}<span aria-hidden="true" className="text-[10px]">{sort.k === k ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
        </button>
      ) : children}
    </th>
  );

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createTask({ projectId, title: title.trim() });
    setTitle('');
  };

  return (
    <div className="flex flex-col gap-3 px-4 pb-8 pt-4 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-arang-muted">{tasks.length} tugas</span>
        <label className="flex items-center gap-2 text-[13px] text-arang-body">Kelompokkan
          <select className="input input-sm w-auto" value={group} onChange={(e) => setGroup(e.target.value as typeof group)}>
            <option value="none">Tidak ada</option><option value="status">Status</option><option value="orang">Penanggung jawab</option>
          </select>
        </label>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1040px] table-fixed border-collapse text-[13.5px]">
          <thead className="sticky top-0 z-[1] border-b border-line bg-canvas-subtle">
            <tr>
              <Th className="w-[56px] pl-4">Jenis</Th>
              <Th k="key" className="w-[90px]">Kunci</Th>
              <Th k="title">Ringkasan</Th>
              <Th k="status" className="w-[140px]">Status</Th>
              <Th k="assignee" className="w-[180px]">Penanggung jawab</Th>
              <Th k="priority" className="w-[110px]">Prioritas</Th>
              <Th className="w-[110px]">Label</Th>
              <Th k="due" className="w-[96px]">Tenggat</Th>
              <Th k="created" className="w-[96px] pr-4">Dibuat</Th>
            </tr>
          </thead>
          {groups.filter((g) => group === 'none' || g.rows.length).map((g) => (
            <tbody key={g.key}>
              {g.name && (
                <tr className="border-t border-line bg-white"><td colSpan={9} className="px-4 py-2 text-[12.5px] font-bold">{g.name} <span className="font-normal text-arang-muted">· {g.rows.length} tugas</span></td></tr>
              )}
              {g.rows.map((t) => {
                const late = isOverdue(t.dueDate, t.status === 'done');
                return (
                  <tr key={t.id} className="border-t border-line-soft hover:bg-canvas-subtle">
                    <td className="py-1.5 pl-4 pr-3"><IssueTypeIcon milestone={t.isMilestone} /></td>
                    <td className="px-3 py-1.5"><a href={href.tugas(t.id)} className="whitespace-nowrap text-[12.5px] font-semibold">{taskKey(t.id)}</a></td>
                    <td className="px-3 py-1.5"><a href={href.tugas(t.id)} className="block truncate font-medium" style={{ color: '#1F2933' }} title={t.title}>{t.title}</a></td>
                    <td className="px-3 py-1.5">
                      <label className="sr-only" htmlFor={`ls-${t.id}`}>Status {t.title}</label>
                      <select id={`ls-${t.id}`} value={t.status} onChange={(e) => moveTask(t.id, e.target.value as TaskStatus)} className="h-7 cursor-pointer rounded-[4px] border-0 px-1.5 text-[11px] font-bold uppercase tracking-[0.04em] outline-none" style={{ background: STATUS[t.status].bg, color: STATUS[t.status].fg }}>
                        {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-1.5"><Avatar userId={t.assigneeId} size={22} />
                        <label className="sr-only" htmlFor={`la-${t.id}`}>Penanggung jawab {t.title}</label>
                        <select id={`la-${t.id}`} className={ghostSel} value={t.assigneeId} onChange={(e) => updateTask(t.id, { assigneeId: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                      </span>
                    </td>
                    <td className="px-3 py-1.5"><span className="flex items-center gap-1.5"><PriorityIcon priority={t.priority} /><PriorityText priority={t.priority} /></span></td>
                    <td className="px-3 py-1.5">{t.label && <LabelPill label={t.label} />}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[13px] font-medium" style={{ color: late ? '#B42318' : '#3D4750' }}>{fmtDate(t.dueDate)}</td>
                    <td className="whitespace-nowrap py-1.5 pl-3 pr-4 text-[13px] text-arang-muted">{fmtDate(t.createdAt.slice(0, 10))}</td>
                  </tr>
                );
              })}
            </tbody>
          ))}
          <tbody>
            <tr className="border-t border-line">
              <td colSpan={9} className="px-3 py-1.5">
                <form onSubmit={add} className="flex items-center gap-2">
                  <Plus size={15} className="ml-1 text-arang-muted" />
                  <label htmlFor="list-new" className="sr-only">Buat tugas baru</label>
                  <input id="list-new" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Buat tugas — ketik ringkasan lalu Enter" className="h-8 flex-1 rounded-md border border-transparent bg-transparent px-2 text-[13.5px] outline-none hover:border-line focus:border-brand-bright focus:bg-white" />
                  {title.trim() && <button type="submit" className="btn btn-primary btn-sm">Buat</button>}
                </form>
              </td>
            </tr>
          </tbody>
        </table>
        {!tasks.length && <Empty title="Belum ada tugas" text="Ketik ringkasan di baris paling bawah untuk membuat tugas pertama." />}
      </div>
    </div>
  );
};

/* ---------------- Kalender ---------------- */
const Calendar: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const first = new Date(cursor);
  const startOffset = (first.getDay() + 6) % 7; // Senin pertama
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - startOffset);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const today = todayISO();
  const evStyle = (t: Task) => (t.isMilestone ? ['#1F2933', '#FFFFFF'] : isOverdue(t.dueDate, t.status === 'done') ? ['#FDECEA', '#B42318'] : t.status === 'done' ? ['#E3F3F0', '#0B5F54'] : t.status === 'review' ? ['#FDF3DC', '#6B4A00'] : t.status === 'in_progress' ? ['#E6EFFA', '#1D5FA8'] : ['#ECEEEA', '#3D4750']);
  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-6 sm:px-8">
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Bulan sebelumnya" className="btn-icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
        <span className="min-w-[150px] text-center text-base font-bold">{BULAN_PANJANG[cursor.getMonth()]} {cursor.getFullYear()}</span>
        <button type="button" aria-label="Bulan berikutnya" className="btn-icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Hari ini</button>
      </div>
      <div className="card overflow-x-auto">
        <div className="grid min-w-[840px] grid-cols-7">
          {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((w) => <div key={w} className="border-b border-line px-3 py-2.5 text-xs font-bold text-arang-muted">{w}</div>)}
          {cells.map((d) => {
            const iso = toISODate(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const ev = tasks.filter((t) => t.dueDate === iso);
            return (
              <div key={iso} className="flex min-h-[112px] flex-col gap-1 border-b border-r border-line-soft p-2" style={{ background: inMonth ? '#fff' : '#F7F8F6' }}>
                <span className="inline-flex h-[26px] min-w-[26px] items-center justify-center self-start rounded-full px-1.5 text-[13px]" style={{ fontWeight: iso === today ? 700 : 500, color: iso === today ? '#fff' : inMonth ? '#1F2933' : '#8A949B', background: iso === today ? '#0B7A6B' : 'transparent' }}>{d.getDate()}</span>
                {ev.map((t) => { const [bg, fg] = evStyle(t); return <a key={t.id} href={href.tugas(t.id)} className="truncate rounded-md px-1.5 py-1 text-xs font-semibold leading-tight" style={{ background: bg, color: fg }} title={t.title}>{t.title}</a>; })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ---------------- Timeline ---------------- */
const Timeline: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const rows = [...tasks].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const today = todayISO();
  const min = rows.length ? rows.map((t) => t.startDate).reduce((a, b) => (a < b ? a : b)) : today;
  const max = rows.length ? rows.map((t) => t.dueDate).reduce((a, b) => (a > b ? a : b)) : addDays(today, 30);
  const from = addDays(min < today ? min : today, -2);
  const days = Math.max(14, diffDays(from, max) + 3);
  const px = 34;
  const pos = (iso: string) => diffDays(from, iso) * px;
  const color = (t: Task) => (isOverdue(t.dueDate, t.status === 'done') ? '#B42318' : STATUS[t.status].bar);
  const legend: [string, string][] = [['#0F9D8A', 'Rampung'], ['#F2B33D', 'Review'], ['#1D5FA8', 'Dikerjakan'], ['#9AA39C', 'Belum mulai'], ['#B42318', 'Terlambat']];
  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-6 sm:px-8">
      <div className="flex flex-wrap gap-4 text-[13px] text-arang-body">{legend.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px]" style={{ background: c }} />{l}</span>)}</div>
      <div className="card overflow-x-auto">
        <div style={{ minWidth: 260 + days * px }}>
          <div className="flex border-b border-line">
            <div className="sticky left-0 z-10 w-[260px] shrink-0 bg-white px-[18px] py-3 text-xs font-bold text-arang-muted">TUGAS</div>
            <div className="flex">{Array.from({ length: days }, (_, i) => { const iso = addDays(from, i); const d = parseISODate(iso); const isT = iso === today; return <div key={iso} className="shrink-0 py-1.5 text-center text-[11px]" style={{ width: px, background: isT ? '#E3F3F0' : d.getDay() === 0 || d.getDay() === 6 ? '#F7F8F6' : 'transparent', color: isT ? '#0B5F54' : '#5B6670', fontWeight: isT ? 800 : 500 }}>{d.getDate() === 1 || i === 0 ? <div className="text-[10px] font-bold">{HARI[d.getDay()].slice(0, 1)}{' '}{fmtDate(iso).split(' ')[1]}</div> : <div className="text-[10px]">{HARI[d.getDay()].slice(0, 1)}</div>}{d.getDate()}</div>; })}</div>
          </div>
          {rows.map((t) => {
            const left = pos(t.startDate);
            const width = Math.max(px, (diffDays(t.startDate, t.dueDate) + 1) * px);
            return (
              <div key={t.id} className="flex border-b border-line-soft">
                <a href={href.tugas(t.id)} className="sticky left-0 z-10 flex h-11 w-[260px] shrink-0 items-center justify-between gap-2 bg-white px-[18px] text-[13px] font-semibold" style={{ color: '#1F2933' }}><span className="truncate">{t.title}</span><Avatar userId={t.assigneeId} size={22} /></a>
                <div className="relative h-11 shrink-0" style={{ width: days * px, background: `repeating-linear-gradient(90deg,transparent 0,transparent ${px - 1}px,#F1F2F0 ${px - 1}px,#F1F2F0 ${px}px)` }}>
                  <div className="absolute inset-y-0 w-0.5 bg-brand" style={{ left: pos(today) + px / 2 }} />
                  {t.isMilestone
                    ? <div className="absolute top-[13px] h-[18px] w-[18px] rotate-45 rounded-[3px] bg-arang" style={{ left: left + px / 2 - 9 }} title={t.title} />
                    : <div className="absolute top-3 h-5 overflow-hidden rounded-md" style={{ left, width, background: color(t) }} title={`${t.title} · ${fmtDate(t.startDate)} – ${fmtDate(t.dueDate)}`}><div className="h-full bg-white/25" style={{ width: `${100 - taskPct(t)}%`, marginLeft: `${taskPct(t)}%` }} /></div>}
                </div>
              </div>
            );
          })}
          <div className="flex justify-between px-[18px] py-3 text-xs text-arang-muted"><span>Garis hijau = hari ini</span><span>Belah ketupat = milestone</span></div>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Tabel ---------------- */
const TableView: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const { updateTask, moveTask, users, taskKey } = useApp();
  return (
    <div className="px-4 pb-8 pt-4 sm:px-8">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="border-b border-line bg-canvas-subtle"><tr className="text-left text-[12px] text-arang-muted">{['Kode', 'Tugas', 'Status', 'Penanggung jawab', 'Prioritas', 'Mulai', 'Tenggat', 'Estimasi'].map((h, i) => <th key={h} className={`px-3 py-2.5 font-semibold ${i === 0 ? 'pl-5' : ''}`}>{h}</th>)}</tr></thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-t border-line-soft hover:bg-canvas-subtle">
                <td className="whitespace-nowrap py-1.5 pl-5 pr-3"><span className="inline-flex items-center gap-1.5"><IssueTypeIcon size={15} milestone={t.isMilestone} /><a href={href.tugas(t.id)} className="text-[12.5px] font-semibold">{taskKey(t.id)}</a></span></td>
                <td className="py-2 px-3 font-semibold"><a href={href.tugas(t.id)} style={{ color: '#1F2933' }}>{t.title}</a></td>
                <td className="px-3 py-2"><label className="sr-only" htmlFor={`s-${t.id}`}>Status</label><select id={`s-${t.id}`} className={ghostSel} value={t.status} onChange={(e) => moveTask(t.id, e.target.value as TaskStatus)}>{STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select></td>
                <td className="px-3 py-2"><label className="sr-only" htmlFor={`a-${t.id}`}>Penanggung jawab</label><select id={`a-${t.id}`} className={ghostSel} value={t.assigneeId} onChange={(e) => updateTask(t.id, { assigneeId: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.shortName}</option>)}</select></td>
                <td className="px-3 py-2"><label className="sr-only" htmlFor={`p-${t.id}`}>Prioritas</label><select id={`p-${t.id}`} className={ghostSel} value={t.priority} onChange={(e) => updateTask(t.id, { priority: e.target.value as Task['priority'] })}>{(Object.keys(PRIORITY) as Task['priority'][]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}</select></td>
                <td className="px-3 py-2"><label className="sr-only" htmlFor={`m-${t.id}`}>Mulai</label><input id={`m-${t.id}`} type="date" className={ghostSel} value={t.startDate} onChange={(e) => e.target.value && updateTask(t.id, { startDate: e.target.value })} /></td>
                <td className="px-3 py-2"><label className="sr-only" htmlFor={`d-${t.id}`}>Tenggat</label><input id={`d-${t.id}`} type="date" className={ghostSel} value={t.dueDate} onChange={(e) => e.target.value && updateTask(t.id, { dueDate: e.target.value })} /></td>
                <td className="px-3 py-2 text-arang-muted">{t.estimatedHours ? `${t.estimatedHours} j` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ---------------- Docs ---------------- */
const Docs: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { projects, updateProject, notify } = useApp();
  const p = projects.find((x) => x.id === projectId)!;
  const [text, setText] = useState(p.docsContent);
  const [edit, setEdit] = useState(false);
  const render = (src: string) => src.split('\n').map((l, i) => {
    if (l.startsWith('# ')) return <h2 key={i} className="mb-2 mt-0 text-2xl font-extrabold">{l.slice(2)}</h2>;
    if (l.startsWith('## ')) return <h3 key={i} className="mb-1 mt-5 text-base font-bold">{l.slice(3)}</h3>;
    if (l.startsWith('- ')) return <li key={i} className="ml-5 list-disc leading-relaxed text-arang-body">{l.slice(2)}</li>;
    if (!l.trim()) return <div key={i} className="h-2" />;
    return <p key={i} className="m-0 leading-relaxed text-arang-body">{l}</p>;
  });
  return (
    <div className="px-4 pb-8 pt-6 sm:px-8">
      <div className="card flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between"><h2 className="card-title">Docs proyek</h2>
          {edit ? <div className="flex gap-2"><button type="button" className="btn btn-outline btn-sm" onClick={() => { setText(p.docsContent); setEdit(false); }}>Batal</button><button type="button" className="btn btn-primary btn-sm" onClick={() => { updateProject(p.id, { docsContent: text }); setEdit(false); notify('Docs disimpan', undefined, 'success'); }}>Simpan</button></div>
            : <button type="button" className="btn btn-outline btn-sm" onClick={() => setEdit(true)}>Ubah</button>}
        </div>
        {edit ? <><label htmlFor="docs" className="sr-only">Isi docs</label><textarea id="docs" className="input min-h-[320px] font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} /><span className="text-xs text-arang-muted">Gunakan # judul, ## subjudul, dan - untuk poin.</span></> : <div className="text-[15px]">{render(p.docsContent)}</div>}
      </div>
    </div>
  );
};

/* ---------------- Halaman ---------------- */
export const ProjectPage: React.FC<{ projectId: string; view: ProjectView }> = ({ projectId, view }) => {
  const { projects, tasks, users, me, openCreateTask, setModal, workspace, automations, clients, notify, mode, taskKey } = useApp();
  const [q, setQ] = useState('');
  const [who, setWho] = useState('all');
  const [prio, setPrio] = useState('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [onlyDueSoon, setOnlyDueSoon] = useState(false);
  const [onlyAttach, setOnlyAttach] = useState(false);
  const [aiSummary, setAiSummary] = useState<AiSummarizeResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiModal, setAiModal] = useState(false);
  const p = projects.find((x) => x.id === projectId);
  const all = useMemo(() => tasks.filter((t) => t.projectId === projectId), [tasks, projectId]);
  const list = useMemo(() => all.filter((t) => {
    if (q && !t.title.toLowerCase().includes(q.toLowerCase())) return false;
    if (who !== 'all' && t.assigneeId !== who) return false;
    if (prio !== 'all' && t.priority !== prio) return false;
    if (onlyMine && t.assigneeId !== me.id) return false;
    if (onlyHigh && t.priority !== 'high') return false;
    if (onlyDueSoon && (t.status === 'done' || diffDays(todayISO(), t.dueDate) > 3)) return false;
    if (onlyAttach && t.attachments.length === 0) return false;
    return true;
  }), [all, q, who, prio, onlyMine, onlyHigh, onlyDueSoon, onlyAttach, me.id]);

  if (!p) return <Empty title="Proyek tidak ditemukan" text="Proyek ini mungkin sudah dihapus."><a className="btn btn-primary" href={href.dashboard}>Ke dashboard</a></Empty>;
  const done = all.filter((t) => t.status === 'done').length;
  const client = clients.find((c) => c.id === p.clientId);

  const handleAiSummary = async () => {
    setAiLoading(true);
    setAiModal(true);
    try {
      // Server menghitung dari data proyek yang tersimpan, bukan dari kiriman klien.
      setAiSummary(await api.aiSummarize({ projectId: p.id }));
    } catch (e) {
      setAiModal(false);
      notify('Gagal menganalisis proyek', mode === 'server' ? errMsg(e) : 'Analisis proyek hanya tersedia setelah masuk dengan akun.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleExportCsv = () => {
    const rows = [
      [
        'Kode Tiket',
        'Judul Tugas',
        'Status',
        'Prioritas',
        'Penanggung Jawab',
        'Label',
        'Tanggal Mulai',
        'Tenggat Waktu',
        'Subtask Selesai',
        'Total Subtask',
        'Deskripsi',
      ],
      ...all.map((t) => [
        taskKey(t.id),
        t.title,
        STATUS[t.status]?.label || t.status,
        PRIORITY[t.priority]?.label || t.priority,
        users.find((u) => u.id === t.assigneeId)?.name || 'Belum ditugaskan',
        t.label,
        t.startDate || '',
        t.dueDate,
        subDone(t),
        t.subtasks.length,
        t.description || '',
      ]),
    ];
    exportCsv(`${p.shortName}_Daftar_Tugas_${todayISO()}.csv`, rows);
    notify('Berhasil mengekspor tugas', `${all.length} tugas berhasil diekspor ke file CSV/Excel.`, 'success');
  };

  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-3 px-4 pt-5 sm:px-8">
        <nav aria-label="Jejak halaman" className="flex items-center gap-1.5 text-[13px] text-arang-muted">
          <a href={href.dashboard} className="hover:text-brand" style={{ color: '#5B6670' }}>Proyek</a><span aria-hidden="true">/</span>
          <span className="truncate font-medium" style={{ color: '#3D4750' }}>{p.name}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="page-title">{PROJECT_VIEWS.find((v) => v.key === view)?.label ?? 'Papan'} · {p.name}</h1>
            <span className="eyebrow">{client ? client.company : 'Proyek internal'} · tenggat {fmtDate(p.dueDate)} · {pct(done, all.length)}% rampung ({done}/{all.length})</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 flex" aria-label="Anggota proyek">{p.memberIds.map((id, i) => <span key={id} style={{ marginLeft: i ? -6 : 0 }}><Avatar userId={id} size={30} ring /></span>)}</div>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleExportCsv} title="Ekspor daftar tugas ke CSV/Excel"><Download size={14} />Ekspor CSV</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleAiSummary}><Sparkles size={14} />Ringkas AI</button>
            {workspace.plan !== 'gratis' && <button type="button" className="btn btn-outline btn-sm" onClick={() => setModal('automation')}><Zap size={14} />Otomasi · {automations.filter((a) => a.isActive).length}</button>}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => openCreateTask({ projectId })}><Plus size={15} />Tugas baru</button>
          </div>
        </div>
      </header>

      <div className="mt-3 flex flex-col gap-2.5 border-b border-line px-4 pb-3 sm:px-8">
        {/* Tab tampilan hanya di ponsel/tablet; di desktop ada di sidebar proyek */}
        <nav aria-label="Tampilan proyek" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line-soft px-4 text-sm lg:hidden">
          {PROJECT_VIEWS.map((v) => <a key={v.key} href={href.proyek(p.id, v.key)} aria-current={view === v.key ? 'page' : undefined} className="flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[13.5px] font-semibold" style={view === v.key ? { borderColor: '#0F9D8A', color: '#0B5F54' } : { borderColor: 'transparent', color: '#5B6670' }}>{v.label}</a>)}
        </nav>

        {view !== 'docs' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto"><Search size={14} className="pointer-events-none absolute left-2.5 top-[9px] text-arang-muted" /><label htmlFor="cari" className="sr-only">Cari tugas</label><input id="cari" type="search" placeholder="Cari tugas…" value={q} onChange={(e) => setQ(e.target.value)} className="input input-sm w-full pl-8 sm:w-[200px]" /></div>

            <div role="group" aria-label="Filter penanggung jawab" className="flex items-center">
              {p.memberIds.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={who === id}
                  aria-label={`Filter tugas ${users.find((u) => u.id === id)?.name ?? ''}`}
                  title={users.find((u) => u.id === id)?.name}
                  onClick={() => setWho(who === id ? 'all' : id)}
                  className="cursor-pointer rounded-full border-0 bg-transparent p-0 transition-transform hover:-translate-y-0.5"
                  style={{ marginLeft: i ? -6 : 0, boxShadow: who === id ? '0 0 0 2px #fff, 0 0 0 4px #0F9D8A' : undefined, zIndex: who === id ? 2 : 1 }}
                >
                  <Avatar userId={id} size={28} ring />
                </button>
              ))}
            </div>

            <label htmlFor="f-prio" className="sr-only">Prioritas</label>
            <select id="f-prio" className="input input-sm w-auto" value={prio} onChange={(e) => setPrio(e.target.value)}><option value="all">Semua prioritas</option>{(Object.keys(PRIORITY) as Task['priority'][]).map((x) => <option key={x} value={x}>{PRIORITY[x].label}</option>)}</select>

            <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
            {([
              ['Hanya tugas saya', onlyMine, setOnlyMine],
              ['Prioritas tinggi', onlyHigh, setOnlyHigh],
              ['Tenggat ≤ 3 hari', onlyDueSoon, setOnlyDueSoon],
              ['Ada lampiran', onlyAttach, setOnlyAttach],
            ] as const).map(([label, on, set]) => (
              <button key={label} type="button" aria-pressed={on} onClick={() => set(!on)} className={`h-8 cursor-pointer rounded-lg border px-2.5 text-[13px] font-semibold transition-colors ${on ? 'border-brand-bright bg-brand-soft text-brand-ink' : 'border-line bg-white text-arang-body hover:border-line-strong hover:bg-canvas-subtle'}`}>{label}</button>
            ))}
            {(onlyMine || onlyHigh || onlyDueSoon || onlyAttach || q || who !== 'all' || prio !== 'all') && (
              <button type="button" onClick={() => { setOnlyMine(false); setOnlyHigh(false); setOnlyDueSoon(false); setOnlyAttach(false); setQ(''); setWho('all'); setPrio('all'); }} className="cursor-pointer border-0 bg-transparent px-1.5 text-[13px] font-semibold text-arang-muted underline hover:text-danger">Atur ulang</button>
            )}
          </div>
        )}
      </div>

      {view === 'kanban' && <Kanban tasks={list} projectId={p.id} />}
      {view === 'list' && <ListView tasks={list} projectId={p.id} />}
      {view === 'kalender' && <Calendar tasks={list} />}
      {view === 'timeline' && <Timeline tasks={list} />}
      {view === 'tabel' && <TableView tasks={list} />}
      {view === 'docs' && <Docs key={p.id} projectId={p.id} />}

      <Modal open={aiModal} onClose={() => setAiModal(false)} title={`Analisis & Ringkasan AI: ${p.name}`} footer={<button type="button" className="btn btn-primary" onClick={() => setAiModal(false)}>Tutup</button>}>
        {aiLoading ? (
          <div className="py-8 text-center text-sm text-arang-muted">Asisten AI sedang menganalisis kesehatan proyek...</div>
        ) : aiSummary ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-xl bg-canvas p-3 border border-line-soft">
              <span className="text-sm font-bold">Tingkat Penyelesaian: {aiSummary.completionRate}</span>
              <Pill bg={aiSummary.healthStatus === 'on_track' ? '#E3F3F0' : '#FDECEA'} fg={aiSummary.healthStatus === 'on_track' ? '#0B5F54' : '#B42318'} className="font-bold">
                {aiSummary.healthStatus === 'on_track' ? 'Sesuai Jadwal' : 'Perlu Perhatian'}
              </Pill>
            </div>
            <p className="m-0 text-sm leading-relaxed text-arang-body">{aiSummary.summary}</p>
            <div className="rounded-xl bg-brand-soft p-3.5 text-xs text-primary font-medium leading-relaxed">
              💡 <strong>Rekomendasi AI:</strong> {aiSummary.recommendation}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export { StatusPill };
