import React, { useEffect, useState } from 'react';
import { Logo, Pill, Progress } from '../components/ui';
import { api } from '../lib/api';
import type { PortalData } from '../lib/api';
import { STATUS, STATUS_ORDER } from '../lib/meta';
import { fmtDate, fmtDateLong, pct } from '../lib/format';

/** Halaman publik baca-saja untuk klien. Tidak memerlukan login. */
export const PortalPage: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<PortalData | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => api.portal(token).then((d) => { if (alive) { setData(d); setErr(''); } }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : 'Gagal memuat.'); });
    load();
    const i = setInterval(load, 30000);
    return () => { alive = false; clearInterval(i); };
  }, [token]);

  if (err) return <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center"><Logo /><h1 className="m-0 text-xl font-extrabold">Portal tidak tersedia</h1><p className="m-0 max-w-sm text-sm text-arang-muted">{err}</p></div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center text-sm text-arang-muted" role="status">Memuat portal...</div>;

  const done = data.tasks.filter((t) => t.status === 'done').length;
  const v = pct(done, data.tasks.length);
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-white"><div className="mx-auto flex max-w-[960px] items-center justify-between gap-4 px-5 py-4"><Logo size={28} /><span className="text-[13px] text-arang-muted">Portal klien · {data.workspace}</span></div></header>
      <main className="mx-auto flex max-w-[960px] flex-col gap-5 px-5 py-8">
        <div className="flex flex-col gap-1"><span className="eyebrow">{data.client ?? 'Proyek'}</span><h1 className="page-title">{data.project.name}</h1>{data.project.description && <p className="m-0 mt-1 max-w-2xl text-[15px] text-arang-body">{data.project.description}</p>}</div>
        <section className="card flex flex-col gap-3 p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-3xl font-extrabold" style={{ color: '#0B7A6B' }}>{v}%</span><span className="text-sm text-arang-muted">{done} dari {data.tasks.length} tugas rampung{data.project.dueDate ? ` · target ${fmtDateLong(data.project.dueDate)}` : ''}</span></div><Progress value={v} h={10} /></section>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          {STATUS_ORDER.map((s) => {
            const list = data.tasks.filter((t) => t.status === s);
            return (
              <section key={s} className="flex flex-col gap-2.5 rounded-card bg-line-soft p-3" aria-label={STATUS[s].label}>
                <div className="flex items-center gap-2 px-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS[s].dot }} /><h2 className="m-0 text-sm font-bold">{STATUS[s].label}</h2><span className="text-[13px] text-arang-muted">{list.length}</span></div>
                {list.map((t, i) => <div key={i} className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-white p-3 text-sm"><span className="font-semibold leading-snug">{t.title}</span><span className="flex flex-wrap items-center gap-2 text-xs text-arang-muted">{t.dueDate && <span>Tenggat {fmtDate(t.dueDate)}</span>}{t.subtasks > 0 && <Pill bg="#ECEEEA" fg="#3D4750">{t.subtasksDone}/{t.subtasks} subtask</Pill>}</span></div>)}
                {!list.length && <span className="px-1 py-2 text-[13px] text-arang-muted">Kosong</span>}
              </section>
            );
          })}
        </div>
        <p className="m-0 text-center text-xs text-arang-muted">Halaman ini hanya menampilkan ringkasan progres dan diperbarui otomatis.</p>
      </main>
    </div>
  );
};
