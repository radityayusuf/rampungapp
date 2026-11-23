import React, { useMemo, useState } from 'react';
import type { Project, Task } from '../types';
import { addDays, diffDays, fmtDate, todayISO } from '../lib/format';

interface Point { date: string; ideal: number; actual: number | null }

const doneDate = (t: Task, today: string) => t.completedAt?.slice(0, 10) ?? (t.status === 'done' ? (t.dueDate < today ? t.dueDate : today) : null);

/** Sisa tugas per hari: garis aktual (tugas yang belum rampung) vs garis ideal (turun rata sampai tenggat). */
export function burndownSeries(tasks: Task[], project: Project): Point[] {
  const today = todayISO();
  const span = Math.max(1, diffDays(project.startDate, project.dueDate));
  const total = tasks.length;
  const done = tasks.map((t) => doneDate(t, today)).filter((d): d is string => !!d);
  return Array.from({ length: span + 1 }, (_, i) => {
    const date = addDays(project.startDate, i);
    return {
      date,
      ideal: Math.round(total * (1 - i / span) * 10) / 10,
      actual: date <= today ? total - done.filter((d) => d <= date).length : null,
    };
  });
}

const W = 640;
const H = 250;
const PAD = { l: 34, r: 56, t: 12, b: 28 };
const ACTUAL = '#0F9D8A'; // lolos validator palet (kontras >= 3:1, chroma cukup)
const IDEAL = '#7A858D';

export const Burndown: React.FC<{ tasks: Task[]; project: Project }> = ({ tasks, project }) => {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const pts = useMemo(() => burndownSeries(tasks, project), [tasks, project]);
  const total = tasks.length;
  const yMax = Math.max(1, total);
  const x = (i: number) => PAD.l + (i / (pts.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b);
  const lastActual = pts.reduce((a, p, i) => (p.actual !== null ? i : a), 0);
  const actualPath = pts.slice(0, lastActual + 1).map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.actual as number).toFixed(1)}`).join(' ');
  const idealPath = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.ideal).toFixed(1)}`).join(' ');
  const yTicks = Array.from(new Set([0, 1, 2, 3, 4].map((k) => Math.round((yMax * k) / 4))));
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (pts.length - 1)));
  const h = hover !== null ? pts[hover] : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (pts.length - 1));
    setHover(Math.max(0, Math.min(pts.length - 1, i)));
  };

  if (!total) return <p className="m-0 py-6 text-center text-sm text-arang-muted">Belum ada tugas di proyek ini.</p>;

  const now = pts[lastActual];
  const idealNow = pts[lastActual]?.ideal ?? 0;
  const status = (now.actual as number) <= idealNow ? 'sesuai atau lebih cepat dari rencana' : 'tertinggal dari rencana';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-[13px] text-arang-body" aria-label="Legenda">
          <span className="flex items-center gap-2"><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke={ACTUAL} strokeWidth="2.5" strokeLinecap="round" /></svg>Aktual (sisa tugas)</span>
          <span className="flex items-center gap-2"><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke={IDEAL} strokeWidth="1.5" strokeDasharray="4 3" /></svg>Ideal</span>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setTable(!table)} aria-pressed={table}>{table ? 'Lihat grafik' : 'Lihat tabel'}</button>
      </div>

      {table ? (
        <div className="max-h-[280px] overflow-auto rounded-lg border border-line-soft">
          <table className="w-full border-collapse text-sm"><caption className="sr-only">Sisa tugas per hari</caption>
            <thead><tr className="sticky top-0 bg-white text-left text-xs text-arang-muted"><th className="px-3 py-2 font-semibold">Tanggal</th><th className="px-3 py-2 text-right font-semibold">Aktual</th><th className="px-3 py-2 text-right font-semibold">Ideal</th></tr></thead>
            <tbody>{pts.map((p) => <tr key={p.date} className="border-t border-line-soft"><td className="px-3 py-1.5">{fmtDate(p.date)}</td><td className="tabular px-3 py-1.5 text-right font-semibold">{p.actual ?? '–'}</td><td className="tabular px-3 py-1.5 text-right text-arang-muted">{p.ideal}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full touch-none select-none" role="img" aria-label={`Grafik burndown ${project.shortName}: ${now.actual} dari ${total} tugas tersisa, ${status}.`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            {yTicks.map((v) => (
              <g key={v}><line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#ECEEEA" strokeWidth="1" /><text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#5B6670">{v}</text></g>
            ))}
            {xTicks.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} fontSize="11" fill="#5B6670">{fmtDate(pts[i].date)}</text>)}
            {pts.some((p) => p.date === todayISO()) && <line x1={x(pts.findIndex((p) => p.date === todayISO()))} x2={x(pts.findIndex((p) => p.date === todayISO()))} y1={PAD.t} y2={H - PAD.b} stroke="#C9CEC8" strokeWidth="1" strokeDasharray="2 3" />}
            <path d={idealPath} fill="none" stroke={IDEAL} strokeWidth="1.5" strokeDasharray="5 4" />
            <path d={actualPath} fill="none" stroke={ACTUAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={x(lastActual)} cy={y(now.actual as number)} r="5" fill={ACTUAL} stroke="#fff" strokeWidth="2" />
            <text x={x(lastActual) + 10} y={y(now.actual as number) + 4} fontSize="12" fontWeight="700" fill="#1F2933">{now.actual}</text>
            <text x={W - PAD.r + 6} y={y(0) + 4} fontSize="12" fill="#3D4750">Ideal</text>
            {h && (
              <g pointerEvents="none">
                <line x1={x(hover as number)} x2={x(hover as number)} y1={PAD.t} y2={H - PAD.b} stroke="#8A949B" strokeWidth="1" />
                {h.actual !== null && <circle cx={x(hover as number)} cy={y(h.actual)} r="5" fill={ACTUAL} stroke="#fff" strokeWidth="2" />}
                <circle cx={x(hover as number)} cy={y(h.ideal)} r="4" fill={IDEAL} stroke="#fff" strokeWidth="2" />
              </g>
            )}
          </svg>
          {h && (
            <div role="status" className="pointer-events-none absolute top-1 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg" style={{ left: `${Math.min(78, Math.max(0, ((x(hover as number) / W) * 100) - 10))}%` }}>
              <div className="mb-1 font-bold">{fmtDate(h.date)}</div>
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: ACTUAL }} />Aktual <strong className="ml-auto pl-3">{h.actual ?? '–'}</strong></div>
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: IDEAL }} />Ideal <strong className="ml-auto pl-3">{h.ideal}</strong></div>
            </div>
          )}
        </div>
      )}
      <p className="m-0 text-xs text-arang-muted">Dihitung dari jumlah tugas proyek saat ini ({total}). Tugas yang ditambahkan belakangan ikut menaikkan titik awal.</p>
    </div>
  );
};
