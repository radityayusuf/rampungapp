import React, { useEffect, useId, useRef } from 'react';
import { ArrowDown, ArrowUp, Check, CheckCircle2, Equal, Info, MessageCircle, X } from 'lucide-react';
import { useApp } from '../store/AppContext';
import type { Priority, TaskStatus } from '../types';
import { PRIORITY, STATUS, labelColors } from '../lib/meta';

export const Logo: React.FC<{ size?: number; dark?: boolean; onlyMark?: boolean }> = ({ size = 30, dark, onlyMark }) => (
  <span className="inline-flex items-center gap-2.5">
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="8" fill={dark ? '#0F9D8A' : '#0B7A6B'} />
      <path d="M8 14.5l4 4 8-9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    {!onlyMark && (
      <span className="text-xl font-extrabold tracking-[-0.3px]" style={{ color: dark ? '#fff' : '#1F2933' }}>
        Rampung
      </span>
    )}
  </span>
);

export const Avatar: React.FC<{ userId: string; size?: number; ring?: boolean; className?: string }> = ({ userId, size = 26, ring, className = '' }) => {
  const { user } = useApp();
  const u = user(userId);
  return (
    <span
      title={u.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${ring ? 'border-2 border-canvas' : ''} ${className}`}
      style={{ width: size, height: size, background: u.color, fontSize: Math.max(10, size * 0.38) }}
    >
      {u.initials}
    </span>
  );
};

export const Pill: React.FC<{ bg: string; fg: string; children: React.ReactNode; className?: string }> = ({ bg, fg, children, className = '' }) => (
  <span className={`pill ${className}`} style={{ background: bg, color: fg }}>
    {children}
  </span>
);

export const LabelPill: React.FC<{ label: string }> = ({ label }) => {
  const [bg, fg] = labelColors(label);
  return <Pill bg={bg} fg={fg}>{label}</Pill>;
};

export const StatusPill: React.FC<{ status: TaskStatus }> = ({ status }) => {
  const s = STATUS[status];
  return <span className="inline-flex items-center whitespace-nowrap rounded-[4px] px-1.5 py-[2px] text-[11px] font-bold uppercase tracking-[0.04em]" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
};

export const PriorityText: React.FC<{ priority: Priority }> = ({ priority }) => (
  <span className="text-xs font-semibold" style={{ color: PRIORITY[priority].fg }}>{PRIORITY[priority].label}</span>
);

/** Ikon jenis tiket ala Jira: kotak tosca bercentang (tugas). */
export const IssueTypeIcon: React.FC<{ size?: number; milestone?: boolean }> = ({ size = 16, milestone }) => (
  <span
    title={milestone ? 'Milestone' : 'Tugas'}
    aria-label={milestone ? 'Milestone' : 'Tugas'}
    className="inline-flex shrink-0 items-center justify-center rounded"
    style={{ width: size, height: size, background: milestone ? '#F2B33D' : '#0F9D8A' }}
  >
    <Check size={size - 5} color={milestone ? '#3D2A00' : '#fff'} strokeWidth={3.5} />
  </span>
);

/** Ikon prioritas ala Jira: panah merah (tinggi), sama dengan kuning (sedang), panah biru (rendah). */
export const PriorityIcon: React.FC<{ priority: Priority; size?: number }> = ({ priority, size = 15 }) => {
  const label = PRIORITY[priority].label;
  const common = { size, strokeWidth: 3, 'aria-label': `Prioritas ${label}` } as const;
  return (
    <span title={`Prioritas ${label}`} className="inline-flex shrink-0 items-center">
      {priority === 'high' ? <ArrowUp {...common} color="#C2362B" /> : priority === 'medium' ? <Equal {...common} color="#D98A0B" /> : <ArrowDown {...common} color="#2F6FB8" />}
    </span>
  );
};

export const Progress: React.FC<{ value: number; color?: string; h?: number }> = ({ value, color = '#0F9D8A', h = 6 }) => (
  <div className="w-full overflow-hidden bg-line-soft" style={{ height: h, borderRadius: h }} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
    <div style={{ height: h, borderRadius: h, width: `${Math.min(100, Math.max(0, value))}%`, background: color, transition: 'width .3s' }} />
  </div>
);

export const Stat: React.FC<{ label: string; value: React.ReactNode; note?: React.ReactNode; tone?: string }> = ({ label, value, note, tone }) => (
  <div className="card flex flex-col gap-1 p-4">
    <span className="text-[13px] text-arang-muted">{label}</span>
    <span className="text-[26px] font-bold leading-tight tracking-tight" style={{ color: tone }}>{value}</span>
    {note && <span className="text-xs text-arang-muted">{note}</span>}
  </div>
);

export const PageHeader: React.FC<{ eyebrow?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }> = ({ eyebrow, title, children }) => (
  <header className="flex flex-wrap items-end justify-between gap-4">
    <div className="flex min-w-0 flex-col gap-1">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1 className="page-title">{title}</h1>
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </header>
);

export const Segmented: React.FC<{ value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }> = ({ value, onChange, options, label }) => (
  <div role="group" aria-label={label} className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-canvas-seg p-0.5 text-[13px]">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        aria-pressed={o.value === value}
        onClick={() => onChange(o.value)}
        className={`h-8 shrink-0 cursor-pointer rounded-md border-0 px-3 ${o.value === value ? 'bg-white font-semibold text-arang shadow-xs' : 'bg-transparent text-arang-body hover:text-arang'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean; size?: 'xl'; footer?: React.ReactNode }> = ({ open, onClose, title, children, wide, size, footer }) => {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = ref.current;
    // Fokus ke isian pertama (atau dialog) saat dibuka.
    const first = root?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? root?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? root)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const [f, l] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === f) { e.preventDefault(); l.focus(); }
      else if (!e.shiftKey && document.activeElement === l) { e.preventDefault(); f.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.(); // kembalikan fokus ke pemicu
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-arang/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-pop outline-none sm:rounded-xl ${size === 'xl' ? 'sm:max-w-[1120px]' : wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-line-soft px-6 py-4">
          <h2 id={titleId} className="m-0 text-[17px] font-bold">{title}</h2>
          <button type="button" aria-label="Tutup" onClick={onClose} className="btn-icon border-0"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
};

export const Field: React.FC<{ label: string; htmlFor: string; children: React.ReactNode; hint?: string }> = ({ label, htmlFor, children, hint }) => (
  <div className="flex flex-col gap-2">
    <label htmlFor={htmlFor} className="field-label">{label}</label>
    {children}
    {hint && <span className="text-xs text-arang-muted">{hint}</span>}
  </div>
);

export const Empty: React.FC<{ title: string; text?: string; children?: React.ReactNode }> = ({ title, text, children }) => (
  <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
    <span className="text-[15px] font-bold">{title}</span>
    {text && <span className="max-w-sm text-sm text-arang-muted">{text}</span>}
    {children}
  </div>
);

export const Toasts: React.FC = () => {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-in pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-lg ${t.tone === 'wa' ? 'border-[#B7E4C0] bg-[#E8F7EC]' : t.tone === 'success' ? 'border-[#B9E0D9] bg-brand-soft' : 'border-line bg-white'}`}
        >
          <span className="mt-0.5 shrink-0">
            {t.tone === 'wa' ? <MessageCircle size={18} color="#1A7F3C" /> : t.tone === 'success' ? <CheckCircle2 size={18} color="#0B7A6B" /> : <Info size={18} color="#1D5FA8" />}
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-bold leading-snug">{t.title}</div>
            {t.body && <div className="mt-0.5 text-[13px] text-arang-body">{t.body}</div>}
          </div>
          <button type="button" aria-label="Tutup notifikasi" onClick={() => dismissToast(t.id)} className="cursor-pointer border-0 bg-transparent p-0.5 text-arang-muted"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
};
