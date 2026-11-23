import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search, Sparkles, Zap } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useIsMobile } from '../lib/useMedia';
import { href } from '../store/router';
import type { ProjectView, Task, TaskStatus } from '../types';
import { Avatar, Empty, LabelPill, Modal, Pill, PriorityText, Progress, StatusPill } from '../components/ui';
import { PRIORITY, STATUS, STATUS_ORDER } from '../lib/meta';
import { BULAN_PANJANG, HARI, addDays, diffDays, fmtDue, fmtDate, isOverdue, parseISODate, pct, todayISO, toISODate } from '../lib/format';
import { api, AiSummarizeResult } from '../lib/api';

const VIEWS: { key: ProjectView; label: string }[] = [
  { key: 'kanban', label: 'Kanban' },
  { key: 'list', label: 'List' },
  { key: 'kalender', label: 'Kalender' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'tabel', label: 'Tabel' },
  { key: 'docs', label: 'Docs' },
];

const subDone = (t: Task) => t.subtasks.filter((s) => s.completed).length;
const taskPct = (t: Task) => (t.status === 'done' ? 100 : pct(subDone(t), t.subtasks.length));

/* ---------------- Kanban ---------------- */
const Card: React.FC<{ t: Task; onDragStart: (id: string) => void }> = ({ t, onDragStart }) => {
  const late = isOverdue(t.dueDate, t.status === 'done');
  return (
    <a
      href={href.tugas(t.id)}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); onDragStart(t.id); }}
      className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-white p-3.5 text-arang hover:border-brand-bright"
      style={{ color: '#1F2933' }}
    >
      <div className="flex items-center justify-between"><LabelPill label={t.label} /><PriorityText priority={t.priority} /></div>
      <span className="text-sm font-semibold leading-snug">{t.title}</span>
      <Progress value={taskPct(t)} h={4} />
      <div className="flex items-center justify-between text-xs text-arang-muted">
        <span className="flex gap-3"><span className="font-semibold" style={{ color: late ? '#B42318' : '#5B6670' }}>{fmtDue(t.dueDate, t.status === 'done')}</span><span>{subDone(t)}/{t.subtasks.length} subtask</span></span>
        <Avatar userId={t.assigneeId} />
      </div>
    </a>
  );
};

const MobileBoard: React.FC<{ tasks: Task[]; projectId: string }> = ({ tasks, projectId }) => {
  const { moveTask, openCreateTask } = useApp();
  const [col, setCol] = useState<TaskStatus>('in_progress');
  const list = tasks.filter((t) => t.status === col);
  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
      <div role="tablist" aria-label="Kolom board" className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {STATUS_ORDER.map((s) => {
          const on = s === col;
          return (
            <button key={s} type="button" role="tab" aria-selected={on} onClick={() => setCol(s)} className="h-10 shrink-0 cursor-pointer rounded-full px-3.5 text-sm font-semibold" style={{ border: `1px solid ${on ? '#1F2933' : '#E2E5E1'}`, background: on ? '#1F2933' : '#fff', color: on ? '#fff' : '#1F2933' }}>
              {STATUS[s].label} · {tasks.filter((t) => t.status === s).length}
            </button>
          );
        })}
      </div>
      {list.map((t) => {
        const late = isOverdue(t.dueDate, t.status === 'done');
        return (
          <div key={t.id} className="flex flex-col gap-2.5 rounded-card border border-line bg-white p-3.5">
            <div className="flex items-center justify-between"><LabelPill label={t.label} /><span className="text-xs font-bold" style={{ color: late ? '#B42318' : '#5B6670' }}>{fmtDue(t.dueDate, t.status === 'done')}</span></div>
            <a href={href.tugas(t.id)} className="text-[15px] font-semibold leading-snug" style={{ color: '#1F2933' }}>{t.title}</a>
            <div className="flex items-center justify-between gap-3 text-xs text-arang-muted">
              <span>{subDone(t)}/{t.subtasks.length} subtask</span>
              <span className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`mv-${t.id}`}>Pindah kolom</label>
                <select id={`mv-${t.id}`} className="input input-sm h-9 w-auto text-xs" value={t.status} onChange={(e) => moveTask(t.id, e.target.value as TaskStatus)}>{STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
                <Avatar userId={t.assigneeId} size={28} />
              </span>
            </div>
          </div>
        );
      })}
      {!list.length && <Empty title="Kolom kosong" text="Belum ada tugas di kolom ini." />}
      <button type="button" onClick={() => openCreateTask({ projectId, status: col })} className="h-12 cursor-pointer rounded-card border border-dashed border-line-strong bg-transparent text-sm text-arang-muted">+ Tambah tugas ke kolom ini</button>
    </div>
  );
};

const Kanban: React.FC<{ tasks: Task[]; projectId: string }> = ({ tasks, projectId }) => {
  const { moveTask, openCreateTask } = useApp();
  const mobile = useIsMobile();
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  if (mobile) return <MobileBoard tasks={tasks} projectId={projectId} />;
  return (
    <div className="flex items-start gap-4 overflow-x-auto px-4 pb-8 pt-6 sm:px-8">
      {STATUS_ORDER.map((st) => {
        const list = tasks.filter((t) => t.status === st);
        return (
          <section
            key={st}
            aria-label={STATUS[st].label}
            onDragOver={(e) => { e.preventDefault(); setOver(st); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || dragId; if (id) moveTask(id, st); setOver(null); setDragId(null); }}
            className="flex w-[285px] shrink-0 flex-col gap-2.5 rounded-card bg-line-soft p-3"
            style={over === st ? { outline: '2px dashed #0F9D8A' } : undefined}
          >
            <div className="flex items-center justify-between px-1 pt-1">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS[st].dot }} /><h2 className="m-0 text-sm font-bold">{STATUS[st].label}</h2><span className="text-[13px] text-arang-muted">{list.length}</span></div>
              <button type="button" aria-label={`Tambah tugas di ${STATUS[st].label}`} onClick={() => openCreateTask({ projectId, status: st })} className="btn-icon h-8 w-8 border-0 bg-transparent"><Plus size={16} /></button>
            </div>
            {list.map((t) => <Card key={t.id} t={t} onDragStart={setDragId} />)}
            <button type="button" onClick={() => openCreateTask({ projectId, status: st })} className="h-10 cursor-pointer rounded-[10px] border border-dashed border-line-strong bg-transparent text-[13px] text-arang-muted">+ Tambah tugas</button>
          </section>
        );
      })}
    </div>
  );
};

/* ---------------- List ---------------- */
const ListView: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const [group, setGroup] = useState<'status' | 'orang'>('status');
  const { users, user } = useApp();
  const groups = group === 'status'
    ? [...STATUS_ORDER].reverse().sort((a, b) => ['review', 'in_progress', 'todo', 'done'].indexOf(a) - ['review', 'in_progress', 'todo', 'done'].indexOf(b)).map((s) => ({ key: s, name: STATUS[s].label, dot: STATUS[s].dot, rows: tasks.filter((t) => t.status === s) }))
    : users.map((u) => ({ key: u.id, name: u.name, dot: u.color, rows: tasks.filter((t) => t.assigneeId === u.id) }));
  return (
    <div className="flex flex-col gap-5 px-4 pb-8 pt-6 sm:px-8">
      <div className="flex justify-end"><button type="button" className="btn btn-outline btn-sm" onClick={() => setGroup(group === 'status' ? 'orang' : 'status')}>Kelompokkan: {group === 'status' ? 'Status' : 'Orang'}</button></div>
      {groups.filter((g) => g.rows.length).map((g) => (
        <section key={g.key} className="card overflow-x-auto">
          <div className="flex items-center gap-2 border-b border-line-soft px-[18px] py-3.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: g.dot }} /><h2 className="m-0 text-sm font-bold">{g.name}</h2><span className="text-[13px] text-arang-muted">{g.rows.length} tugas</span></div>
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead><tr className="text-left text-xs text-arang-muted"><th className="px-[18px] py-2.5 font-semibold">Tugas</th><th className="px-3 py-2.5 font-semibold">Penanggung jawab</th><th className="px-3 py-2.5 font-semibold">Tenggat</th><th className="px-3 py-2.5 font-semibold">Prioritas</th><th className="px-3 py-2.5 font-semibold">Label</th><th className="py-2.5 pl-3 pr-[18px] font-semibold">Subtask</th></tr></thead>
            <tbody>
              {g.rows.map((t) => (
                <tr key={t.id} className="border-t border-line-soft">
                  <td className="px-[18px] py-3 font-semibold"><a href={href.tugas(t.id)} style={{ color: '#1F2933' }}>{t.title}</a></td>
                  <td className="px-3 py-3"><span className="inline-flex items-center gap-2"><Avatar userId={t.assigneeId} size={24} />{user(t.assigneeId).name}</span></td>
                  <td className="px-3 py-3 font-semibold" style={{ color: isOverdue(t.dueDate, t.status === 'done') ? '#B42318' : '#1F2933' }}>{fmtDue(t.dueDate, t.status === 'done')}</td>
                  <td className="px-3 py-3"><PriorityText priority={t.priority} /></td>
                  <td className="px-3 py-3"><LabelPill label={t.label} /></td>
                  <td className="py-3 pl-3 pr-[18px] text-arang-muted">{subDone(t)}/{t.subtasks.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {!tasks.length && <Empty title="Belum ada tugas" text="Tambahkan tugas pertama lewat tombol Tugas baru." />}
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
  const { updateTask, moveTask, users } = useApp();
  return (
    <div className="px-4 pb-8 pt-6 sm:px-8">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead><tr className="text-left text-xs text-arang-muted">{['Tugas', 'Status', 'Penanggung jawab', 'Prioritas', 'Mulai', 'Tenggat', 'Estimasi'].map((h) => <th key={h} className="px-3 py-2.5 font-semibold first:pl-5">{h}</th>)}</tr></thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-t border-line-soft">
                <td className="py-2 pl-5 pr-3 font-semibold"><a href={href.tugas(t.id)} style={{ color: '#1F2933' }}>{t.title}</a></td>
                <td className="px-3 py-2"><label className="sr-only" htmlFor={`s-${t.id}`}>Status</label><select id={`s-${t.id}`} className="input input-sm" value={t.status} onChange={(e) => moveTask(t.id, e.target.value as TaskStatus)}>{STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select></td>
                <td className="px-3 py-2"><label className="sr-only" htmlFor={`a-${t.id}`}>Penanggung jawab</label><select id={`a-${t.id}`} className="input input-sm" value={t.assigneeId} onChange={(e) => updateTask(t.id, { assigneeId: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.shortName}</option>)}</select></td>
                <td className="px-3 py-2"><label className="sr-only" htmlFor={`p-${t.id}`}>Prioritas</label><select id={`p-${t.id}`} className="input input-sm" value={t.priority} onChange={(e) => updateTask(t.id, { priority: e.target.value as Task['priority'] })}>{(Object.keys(PRIORITY) as Task['priority'][]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}</select></td>
                <td className="px-3 py-2"><label className="sr-only" htmlFor={`m-${t.id}`}>Mulai</label><input id={`m-${t.id}`} type="date" className="input input-sm" value={t.startDate} onChange={(e) => e.target.value && updateTask(t.id, { startDate: e.target.value })} /></td>
                <td className="px-3 py-2"><label className="sr-only" htmlFor={`d-${t.id}`}>Tenggat</label><input id={`d-${t.id}`} type="date" className="input input-sm" value={t.dueDate} onChange={(e) => e.target.value && updateTask(t.id, { dueDate: e.target.value })} /></td>
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
  const { projects, tasks, users, openCreateTask, setModal, workspace, automations, clients, notify } = useApp();
  const [q, setQ] = useState('');
  const [who, setWho] = useState('all');
  const [prio, setPrio] = useState('all');
  const [aiSummary, setAiSummary] = useState<AiSummarizeResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiModal, setAiModal] = useState(false);
  const p = projects.find((x) => x.id === projectId);
  const all = useMemo(() => tasks.filter((t) => t.projectId === projectId), [tasks, projectId]);
  const list = useMemo(() => all.filter((t) => (!q || t.title.toLowerCase().includes(q.toLowerCase())) && (who === 'all' || t.assigneeId === who) && (prio === 'all' || t.priority === prio)), [all, q, who, prio]);

  if (!p) return <Empty title="Proyek tidak ditemukan" text="Proyek ini mungkin sudah dihapus."><a className="btn btn-primary" href={href.dashboard}>Ke dashboard</a></Empty>;
  const done = all.filter((t) => t.status === 'done').length;
  const client = clients.find((c) => c.id === p.clientId);

  const handleAiSummary = async () => {
    setAiLoading(true);
    setAiModal(true);
    try {
      const res = await api.aiSummarize({
        projectName: p.name,
        tasks: all.map((t) => ({ title: t.title, status: t.status, priority: t.priority })),
      });
      setAiSummary(res);
    } catch {
      notify('Gagal menganalisis proyek', 'Pastikan backend berjalan.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 px-4 pt-6 sm:px-8">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="eyebrow">{client ? client.company : 'Proyek internal'} · tenggat {fmtDate(p.dueDate)}</span>
          <h1 className="page-title">{p.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex">{p.memberIds.map((id, i) => <span key={id} style={{ marginLeft: i ? -8 : 0 }}><Avatar userId={id} size={34} ring /></span>)}</div>
          <Pill bg="#E3F3F0" fg="#0B5F54" className="text-[13px] font-bold">{pct(done, all.length)}% rampung</Pill>
          <button type="button" className="btn btn-outline" onClick={handleAiSummary}><Sparkles size={15} />Ringkas AI</button>
          {workspace.plan !== 'gratis' && <button type="button" className="btn btn-outline" onClick={() => setModal('automation')}><Zap size={15} />Otomasi · {automations.filter((a) => a.isActive).length}</button>}
          <button type="button" className="btn btn-primary" onClick={() => openCreateTask({ projectId })}><Plus size={16} />Tugas baru</button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 pb-3 sm:px-8">
        <nav aria-label="Tampilan proyek" className="-mx-4 flex max-w-[100vw] gap-1 overflow-x-auto px-4 text-sm sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {VIEWS.map((v) => <a key={v.key} href={href.proyek(p.id, v.key)} aria-current={view === v.key ? 'page' : undefined} className="flex h-10 shrink-0 items-center rounded-lg px-3.5" style={view === v.key ? { background: '#1F2933', color: '#fff', fontWeight: 600 } : { color: '#1F2933' }}>{v.label}</a>)}
        </nav>
        {view !== 'docs' && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-auto"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-arang-muted" /><label htmlFor="cari" className="sr-only">Cari tugas</label><input id="cari" type="search" placeholder="Cari tugas..." value={q} onChange={(e) => setQ(e.target.value)} className="input input-sm w-full pl-9 sm:w-[200px]" /></div>
            <label htmlFor="f-who" className="sr-only">Penanggung jawab</label>
            <select id="f-who" className="input input-sm w-auto flex-1 sm:flex-none" value={who} onChange={(e) => setWho(e.target.value)}><option value="all">Semua orang</option>{users.map((u) => <option key={u.id} value={u.id}>{u.shortName}</option>)}</select>
            <label htmlFor="f-prio" className="sr-only">Prioritas</label>
            <select id="f-prio" className="input input-sm w-auto flex-1 sm:flex-none" value={prio} onChange={(e) => setPrio(e.target.value)}><option value="all">Semua prioritas</option>{(Object.keys(PRIORITY) as Task['priority'][]).map((x) => <option key={x} value={x}>{PRIORITY[x].label}</option>)}</select>
          </div>
        )}
      </div>

      {view === 'kanban' && <Kanban tasks={list} projectId={p.id} />}
      {view === 'list' && <ListView tasks={list} />}
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
