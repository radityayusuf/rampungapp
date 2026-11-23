import React, { useState } from 'react';
import { Check, Download, FolderPlus } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { href } from '../store/router';
import type { Task } from '../types';
import { Avatar, Empty, LabelPill, PageHeader, Pill, Progress, Segmented, Stat } from '../components/ui';
import { STATUS } from '../lib/meta';
import { Burndown } from '../components/Burndown';
import { diffDays, fmtDate, fmtDayDate, fmtDue, fmtDueShort, fmtFullDay, greeting, isOverdue, pct, timeAgo, todayISO } from '../lib/format';

const shell = 'flex flex-col gap-6 px-4 py-6 sm:px-8';

export const DashboardPage: React.FC = () => {
  const { tasks, projects, users, activities, timeEntries, me, user, workspace } = useApp();
  const [period, setPeriod] = useState('week');
  const [bdProject, setBdProject] = useState('');
  const today = todayISO();
  const active = tasks.filter((t) => t.status !== 'done');
  const lateTasks = active.filter((t) => isOverdue(t.dueDate));
  const days = period === 'week' ? 7 : 30;
  const doneNow = tasks.filter((t) => t.completedAt && diffDays(t.completedAt.slice(0, 10), today) < days);
  const donePrev = tasks.filter((t) => t.completedAt && diffDays(t.completedAt.slice(0, 10), today) >= days && diffDays(t.completedAt.slice(0, 10), today) < days * 2);
  const hours = timeEntries.filter((e) => diffDays(e.date, today) < days).reduce((s, e) => s + e.durationSeconds, 0) / 3600;
  const activeProjects = projects.filter((p) => p.status === 'active');
  const upcoming = active.filter((t) => diffDays(today, t.dueDate) <= 7).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);

  const exportCsv = () => {
    const rows = [['Proyek', 'Tugas', 'Status', 'Penanggung jawab', 'Tenggat'], ...tasks.map((t) => [projects.find((p) => p.id === t.projectId)?.shortName ?? '', t.title, STATUS[t.status].label, user(t.assigneeId).name, t.dueDate])];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `rampung-laporan-${today}.csv`;
    a.click();
  };

  return (
    <div className={shell}>
      <PageHeader eyebrow={`${greeting()}, ${me.shortName}`} title="Dashboard Workspace">
        <Segmented label="Periode" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Minggu ini' }, { value: 'month', label: 'Bulan ini' }]} />
        <button type="button" className="btn btn-outline" onClick={exportCsv}><Download size={15} />Ekspor CSV</button>
      </PageHeader>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <Stat label="Tugas aktif" value={active.length} note={`di ${new Set(active.map((t) => t.projectId)).size} proyek`} />
        <Stat label={`Rampung ${period === 'week' ? 'minggu' : 'bulan'} ini`} value={doneNow.length} tone="#0B7A6B" note={<span style={{ color: '#0B5F54', fontWeight: 600 }}>{doneNow.length - donePrev.length >= 0 ? '+' : ''}{doneNow.length - donePrev.length} dari periode lalu</span>} />
        <Stat label="Terlambat" value={lateTasks.length} tone={lateTasks.length ? '#B42318' : undefined} note="perlu ditindaklanjuti" />
        <Stat label="Jam tercatat" value={`${Math.round(hours)} j`} note={workspace.enabledModules.timeTracking ? 'dari Time Tracking' : 'aktifkan modul Time Tracking'} />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section className="card flex min-w-0 flex-[3_1_420px] flex-col gap-4 p-5">
          <h2 className="card-title">Progres proyek</h2>
          {activeProjects.map((p) => {
            const ts = tasks.filter((t) => t.projectId === p.id);
            const v = pct(ts.filter((t) => t.status === 'done').length, ts.length);
            return (
              <a key={p.id} href={href.proyek(p.id)} className="flex flex-col gap-2" style={{ color: '#1F2933' }}>
                <div className="flex justify-between gap-3 text-sm"><span className="font-semibold">{p.shortName}</span><span className="shrink-0 text-arang-muted">{v}% · tenggat {fmtDate(p.dueDate)}</span></div>
                <Progress value={v} h={8} color={v >= 50 ? '#0F9D8A' : '#F2B33D'} />
              </a>
            );
          })}
        </section>
        <section className="card flex min-w-0 flex-[2_1_320px] flex-col gap-3.5 p-5">
          <h2 className="card-title">Beban kerja tim</h2>
          {users.map((u) => {
            const n = active.filter((t) => t.assigneeId === u.id).length;
            return (
              <div key={u.id} className="flex items-center gap-3"><Avatar userId={u.id} size={32} />
                <div className="flex flex-1 flex-col gap-1.5"><div className="flex justify-between text-[13px]"><span className="font-semibold">{u.name}</span><span className="font-semibold" style={{ color: n > 10 ? '#B42318' : '#5B6670' }}>{n} tugas</span></div><Progress value={n * 10} color={n > 10 ? '#B42318' : '#1D5FA8'} /></div>
              </div>
            );
          })}
          <span className="text-xs text-arang-muted">Batas nyaman: 10 tugas aktif per orang</span>
        </section>
      </div>

      {activeProjects.length > 0 && (() => {
        const bp = activeProjects.find((p) => p.id === bdProject) ?? activeProjects[0];
        return (
          <section className="card flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="card-title">Burndown proyek</h2>
              <div><label htmlFor="bd-p" className="sr-only">Proyek</label><select id="bd-p" className="input input-sm w-auto max-w-full" value={bp.id} onChange={(e) => setBdProject(e.target.value)}>{activeProjects.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</select></div></div>
            <Burndown tasks={tasks.filter((t) => t.projectId === bp.id)} project={bp} />
          </section>
        );
      })()}

      <div className="flex flex-wrap items-start gap-4">
        <section className="card flex min-w-0 flex-[1_1_360px] flex-col p-5">
          <h2 className="card-title mb-2">Tenggat minggu ini</h2>
          {!upcoming.length && <span className="py-3 text-sm text-arang-muted">Tidak ada tenggat dalam 7 hari ke depan.</span>}
          {upcoming.map((t) => {
            const late = isOverdue(t.dueDate);
            const soon = diffDays(today, t.dueDate) <= 1;
            return (
              <a key={t.id} href={href.tugas(t.id)} className="flex items-center justify-between gap-3 border-t border-line-soft py-2.5 text-sm" style={{ color: '#1F2933' }}>
                <span className="flex flex-col gap-0.5"><span className="font-semibold">{t.title}</span><span className="text-xs text-arang-muted">{projects.find((p) => p.id === t.projectId)?.shortName}</span></span>
                <Pill bg={late ? '#FDECEA' : soon ? '#FDF3DC' : '#ECEEEA'} fg={late ? '#B42318' : soon ? '#6B4A00' : '#3D4750'} className="font-bold">{fmtDueShort(t.dueDate)}</Pill>
              </a>
            );
          })}
        </section>
        <section className="card flex min-w-0 flex-[1_1_360px] flex-col p-5">
          <h2 className="card-title mb-2">Aktivitas terbaru</h2>
          {activities.slice(0, 6).map((a) => (
            <div key={a.id} className="flex gap-3 border-t border-line-soft py-2.5 text-sm leading-snug"><Avatar userId={a.userId} size={28} /><div className="flex flex-col gap-0.5"><span><strong>{user(a.userId).shortName}</strong> {a.text}</span><span className="text-xs text-arang-muted">{timeAgo(a.createdAt)}</span></div></div>
          ))}
        </section>
      </div>
    </div>
  );
};

const TaskRow: React.FC<{ t: Task; check?: boolean }> = ({ t }) => {
  const { moveTask, projects } = useApp();
  const done = t.status === 'done';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-3.5">
      <button type="button" aria-label={done ? 'Buka kembali' : 'Tandai rampung'} onClick={() => moveTask(t.id, done ? 'in_progress' : 'done')} className="flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full border-2 p-0" style={{ borderColor: done ? '#0F9D8A' : '#C9CEC8', background: done ? '#0F9D8A' : '#fff' }}>{done && <Check size={14} color="#fff" strokeWidth={3} />}</button>
      <a href={href.tugas(t.id)} className="flex min-w-0 flex-1 flex-col gap-0.5" style={{ color: '#1F2933' }}><span className="truncate text-[15px] font-semibold" style={{ textDecoration: done ? 'line-through' : 'none', color: done ? '#5B6670' : '#1F2933' }}>{t.title}</span><span className="truncate text-xs text-arang-muted">{projects.find((p) => p.id === t.projectId)?.shortName}</span></a>
      <span className="hidden sm:inline-flex"><LabelPill label={t.label} /></span>
      <span className="max-w-[110px] shrink-0 text-right text-xs font-bold sm:w-[110px]" style={{ color: isOverdue(t.dueDate, done) ? '#B42318' : '#5B6670' }}>{fmtDue(t.dueDate, done)}</span>
    </div>
  );
};

export const MyTasksPage: React.FC = () => {
  const { tasks, me } = useApp();
  const [tab, setTab] = useState('today');
  const today = todayISO();
  const mine = tasks.filter((t) => t.assigneeId === me.id);
  const open = mine.filter((t) => t.status !== 'done');
  const lateN = open.filter((t) => isOverdue(t.dueDate)).length;
  const list = (tab === 'today' ? mine.filter((t) => t.dueDate <= today && (t.status !== 'done' || t.completedAt?.slice(0, 10) === today)) : tab === 'week' ? open.filter((t) => diffDays(today, t.dueDate) <= 7) : tab === 'late' ? open.filter((t) => isOverdue(t.dueDate)) : mine.filter((t) => t.status === 'done')).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const todays = mine.filter((t) => t.dueDate <= today && (t.status !== 'done' || t.completedAt?.slice(0, 10) === today));
  const todaysDone = todays.filter((t) => t.status === 'done').length;
  return (
    <div className={shell}>
      <PageHeader eyebrow={fmtFullDay(today)} title="Tugas Saya" />
      <div className="card flex flex-col gap-2 p-4"><div className="flex justify-between text-sm font-semibold"><span>Progres hari ini</span><span className="text-arang-muted">{todaysDone} dari {todays.length} rampung</span></div><Progress value={pct(todaysDone, todays.length)} h={8} /></div>
      <Segmented label="Filter tugas" value={tab} onChange={setTab} options={[{ value: 'today', label: 'Hari ini' }, { value: 'week', label: 'Minggu ini' }, { value: 'late', label: `Terlambat ${lateN}` }, { value: 'done', label: 'Rampung' }]} />
      <div className="flex flex-col gap-2.5">{list.map((t) => <TaskRow key={t.id} t={t} />)}{!list.length && <Empty title={tab === 'late' ? 'Tidak ada yang terlambat' : 'Belum ada tugas di sini'} text="Kerja bagus. Tugas baru akan muncul di sini." />}</div>
    </div>
  );
};

export const HomePage: React.FC = () => {
  const { projects, tasks, me, setModal, spaces, notifications } = useApp();
  const open = tasks.filter((t) => t.assigneeId === me.id && t.status !== 'done');
  const unread = notifications.filter((n) => n.userId === me.id && !n.read).length;
  return (
    <div className={shell}>
      <PageHeader eyebrow={`${greeting()}, ${me.shortName}`} title="Beranda">
        <button type="button" className="btn btn-primary" onClick={() => setModal('project')}><FolderPlus size={16} />Proyek baru</button>
      </PageHeader>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        <a href={href.tugasSaya} className="block" style={{ color: '#1F2933' }}><Stat label="Tugas saya" value={open.length} note={`${open.filter((t) => isOverdue(t.dueDate)).length} terlambat`} /></a>
        <a href={href.inbox} className="block" style={{ color: '#1F2933' }}><Stat label="Inbox belum dibaca" value={unread} /></a>
        <a href={href.dashboard} className="block" style={{ color: '#1F2933' }}><Stat label="Proyek aktif" value={projects.filter((p) => p.status === 'active').length} /></a>
      </div>
      {spaces.map((s) => {
        const ps = projects.filter((p) => p.spaceId === s.id);
        if (!ps.length) return null;
        return (
          <section key={s.id} className="flex flex-col gap-3"><h2 className="m-0 text-base font-bold">{s.name}</h2>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
              {ps.map((p) => { const ts = tasks.filter((t) => t.projectId === p.id); const v = pct(ts.filter((t) => t.status === 'done').length, ts.length); return (
                <a key={p.id} href={href.proyek(p.id)} className="card flex flex-col gap-3 p-4 hover:border-brand-bright" style={{ color: '#1F2933' }}>
                  <span className="text-[15px] font-bold">{p.name}</span><span className="line-clamp-2 text-[13px] text-arang-muted">{p.description}</span>
                  <Progress value={v} h={6} /><div className="flex justify-between text-xs text-arang-muted"><span>{v}% rampung · {ts.length} tugas</span><span>tenggat {fmtDate(p.dueDate)}</span></div>
                </a>); })}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export const InboxPage: React.FC = () => {
  const { notifications, me, user, markAllRead, markRead } = useApp();
  const mine = notifications.filter((n) => n.userId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const kind: Record<string, [string, string, string]> = { mention: ['Sebutan', '#F0EBFB', '#5B3AA8'], assign: ['Tugas baru', '#E6EFFA', '#1D5FA8'], due: ['Tenggat', '#FDECEA', '#B42318'], status: ['Status', '#E3F3F0', '#0B5F54'], comment: ['Komentar', '#ECEEEA', '#3D4750'] };
  return (
    <div className={shell}>
      <PageHeader title="Inbox" eyebrow={`${mine.filter((n) => !n.read).length} belum dibaca`}><button type="button" className="btn btn-outline" onClick={markAllRead}>Tandai semua terbaca</button></PageHeader>
      <div className="flex flex-col gap-2.5">
        {mine.map((n) => { const [l, bg, fg] = kind[n.kind]; return (
          <a key={n.id} href={n.taskId ? href.tugas(n.taskId) : '#'} onClick={() => markRead(n.id)} className="card flex items-start gap-3 p-4" style={{ color: '#1F2933', background: n.read ? '#fff' : '#F7FBFA' }}>
            <Avatar userId={n.actorId} size={34} />
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm leading-snug"><span><strong>{user(n.actorId).shortName}</strong> {n.text}</span><span className="text-xs text-arang-muted">{timeAgo(n.createdAt)}</span></div>
            <Pill bg={bg} fg={fg}>{l}</Pill>{!n.read && <span aria-label="Belum dibaca" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-kunyit" />}
          </a>); })}
        {!mine.length && <Empty title="Inbox kosong" text="Sebutan, tugas baru, dan pengingat tenggat akan muncul di sini." />}
      </div>
    </div>
  );
};

export { fmtDayDate };
