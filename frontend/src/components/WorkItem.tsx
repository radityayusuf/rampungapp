import React from 'react';
import { Check } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { href } from '../store/router';
import type { Task } from '../types';
import { Avatar, IssueTypeIcon, PriorityIcon, StatusPill } from './ui';
import { fmtDue, isOverdue } from '../lib/format';

/** Baris tiket ala Jira "Your work": ikon jenis, judul, kunci · proyek, prioritas, status, tenggat, penanggung jawab. */
export const WorkItemRow: React.FC<{ t: Task; meta?: React.ReactNode; checkable?: boolean; first?: boolean }> = ({ t, meta, checkable, first }) => {
  const { projects, taskKey, moveTask } = useApp();
  const p = projects.find((x) => x.id === t.projectId);
  const done = t.status === 'done';
  return (
    <div className={`group flex min-h-[52px] items-center gap-3 px-3 py-2 transition-colors hover:bg-canvas-subtle sm:px-4 ${first ? '' : 'border-t border-line-soft'}`}>
      {checkable ? (
        <button type="button" aria-label={done ? 'Buka kembali' : 'Tandai rampung'} onClick={() => moveTask(t.id, done ? 'in_progress' : 'done')} className="flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded border-2 p-0 transition-colors" style={{ borderColor: done ? '#0F9D8A' : '#C9CEC8', background: done ? '#0F9D8A' : '#fff' }}>
          {done && <Check size={12} color="#fff" strokeWidth={3.5} />}
        </button>
      ) : (
        <IssueTypeIcon milestone={t.isMilestone} />
      )}
      <a href={href.tugas(t.id)} className="flex min-w-0 flex-1 flex-col leading-tight" style={{ color: '#1F2933' }}>
        <span className="truncate text-[14px] font-medium" style={done ? { textDecoration: 'line-through', color: '#5B6670' } : undefined}>{t.title}</span>
        <span className="truncate text-[12.5px] text-arang-muted">{taskKey(t.id)} · {p?.name ?? 'Proyek'}{meta ? <> · {meta}</> : null}</span>
      </a>
      <span className="hidden sm:inline-flex"><PriorityIcon priority={t.priority} /></span>
      <span className="hidden md:inline-flex"><StatusPill status={t.status} /></span>
      <span className="w-[120px] shrink-0 whitespace-nowrap text-right text-xs font-semibold" style={{ color: isOverdue(t.dueDate, done) ? '#B42318' : '#5B6670' }}>{fmtDue(t.dueDate, done)}</span>
      <span className="hidden sm:inline-flex"><Avatar userId={t.assigneeId} size={24} /></span>
    </div>
  );
};

/** Tab garis bawah ala Jira. */
export const UnderlineTabs: React.FC<{ value: string; onChange: (v: string) => void; label: string; options: { value: string; label: React.ReactNode }[] }> = ({ value, onChange, label, options }) => (
  <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        role="tab"
        aria-selected={o.value === value}
        onClick={() => onChange(o.value)}
        className="-mb-px flex h-10 shrink-0 cursor-pointer items-center gap-1.5 border-0 border-b-2 bg-transparent px-3 text-[13.5px] font-semibold transition-colors"
        style={o.value === value ? { borderBottomColor: '#0F9D8A', color: '#0B5F54' } : { borderBottomColor: 'transparent', color: '#5B6670' }}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/** Riwayat tiket yang dilihat — kenyamanan per peramban saja, tidak pernah dianggap data penting. */
const RECENT_KEY = 'rampung_recent_tasks';
export const rememberViewed = (taskId: string) => {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as { id: string; at: string }[];
    const next = [{ id: taskId, at: new Date().toISOString() }, ...list.filter((x) => x.id !== taskId)].slice(0, 30);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* penyimpanan peramban tidak tersedia */
  }
};
export const recentlyViewed = (): { id: string; at: string }[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
};
