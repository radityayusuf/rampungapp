import React, { useState } from 'react';
import { Download, FolderPlus } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { href } from '../store/router';
import type { Task } from '../types';
import { Avatar, Empty, PageHeader, Pill, Progress, Segmented, Stat } from '../components/ui';
import { UnderlineTabs, WorkItemRow, recentlyViewed } from '../components/WorkItem';
import { NotificationItem } from '../components/NotificationPanel';
import { STATUS } from '../lib/meta';
import { Burndown } from '../components/Burndown';
import { diffDays, fmtDate, fmtDayDate, fmtDueShort, fmtFullDay, greeting, isOverdue, pct, timeAgo, todayISO } from '../lib/format';

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

type Section = { title: string; items: { t: Task; meta?: React.ReactNode }[] };

/** Kelompokkan menurut waktu: Hari ini / 7 hari terakhir / Lebih lama — seperti "Your work" di Jira. */
const byWhen = (rows: { t: Task; at: string }[], verb: string): Section[] => {
  const today = todayISO();
  const groups: Section[] = [{ title: 'HARI INI', items: [] }, { title: '7 HARI TERAKHIR', items: [] }, { title: 'LEBIH LAMA', items: [] }];
  for (const r of rows) {
    const d = diffDays(r.at.slice(0, 10), today);
    groups[d <= 0 ? 0 : d <= 7 ? 1 : 2].items.push({ t: r.t, meta: `${verb} ${timeAgo(r.at)}` });
  }
  return groups.filter((g) => g.items.length);
};

const WorkList: React.FC<{ sections: Section[]; empty: React.ReactNode; checkable?: boolean }> = ({ sections, empty, checkable }) => {
  if (!sections.some((s) => s.items.length)) return <div className="card">{empty}</div>;
  return (
    <div className="flex flex-col gap-5">
      {sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-2">
          {s.title && <h3 className="m-0 text-[11.5px] font-bold uppercase tracking-[0.07em] text-arang-muted">{s.title}</h3>}
          <div className="card overflow-hidden">{s.items.map((i, idx) => <WorkItemRow key={i.t.id} t={i.t} meta={i.meta} checkable={checkable} first={idx === 0} />)}</div>
        </section>
      ))}
    </div>
  );
};

export const MyTasksPage: React.FC = () => {
  const { tasks, me } = useApp();
  const [tab, setTab] = useState('today');
  const today = todayISO();
  const mine = tasks.filter((t) => t.assigneeId === me.id);
  const open = mine.filter((t) => t.status !== 'done');
  const todays = mine.filter((t) => t.dueDate <= today && (t.status !== 'done' || t.completedAt?.slice(0, 10) === today));
  const week = open.filter((t) => diffDays(today, t.dueDate) <= 7);
  const late = open.filter((t) => isOverdue(t.dueDate));
  const doneList = mine.filter((t) => t.status === 'done');
  const todaysDone = todays.filter((t) => t.status === 'done').length;
  const list = (tab === 'today' ? todays : tab === 'week' ? week : tab === 'late' ? late : tab === 'all' ? open : doneList).slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const count = (n: number) => <span className="rounded-full bg-line-soft px-1.5 text-[11px] font-bold text-arang-muted">{n}</span>;
  return (
    <div className={shell}>
      <PageHeader eyebrow={fmtFullDay(today)} title="Tugas Saya" />
      <div className="card flex flex-col gap-2 p-4">
        <div className="flex justify-between text-[13.5px] font-semibold"><span>Progres hari ini</span><span className="text-arang-muted">{todaysDone} dari {todays.length} rampung</span></div>
        <Progress value={pct(todaysDone, todays.length)} h={8} />
      </div>
      <UnderlineTabs label="Filter tugas" value={tab} onChange={setTab} options={[
        { value: 'today', label: <>Hari ini {count(todays.length)}</> },
        { value: 'week', label: <>7 hari ke depan {count(week.length)}</> },
        { value: 'late', label: <>Terlambat {count(late.length)}</> },
        { value: 'all', label: <>Semua terbuka {count(open.length)}</> },
        { value: 'done', label: <>Rampung {count(doneList.length)}</> },
      ]} />
      <WorkList checkable sections={[{ title: '', items: list.map((t) => ({ t })) }]} empty={<Empty title={tab === 'late' ? 'Tidak ada yang terlambat' : 'Belum ada tugas di sini'} text="Kerja bagus. Tugas baru akan muncul di sini." />} />
    </div>
  );
};

export const HomePage: React.FC = () => {
  const { projects, tasks, me, setModal, activities, taskKey } = useApp();
  const [tab, setTab] = useState('assigned');
  const assigned = tasks.filter((t) => t.assigneeId === me.id && t.status !== 'done').sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // "Dikerjakan": tiket yang terakhir Anda ubah/komentari/buat (dari log aktivitas server).
  const worked = new Map<string, string>();
  for (const a of activities) if (a.userId === me.id && a.taskId && !worked.has(a.taskId)) worked.set(a.taskId, a.createdAt);
  for (const t of tasks) if (t.createdBy === me.id && !worked.has(t.id)) worked.set(t.id, t.createdAt);
  const workedRows = [...worked.entries()].map(([id, at]) => ({ t: tasks.find((x) => x.id === id), at })).filter((r): r is { t: Task; at: string } => !!r.t).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);

  const viewedRows = recentlyViewed().map((r) => ({ t: tasks.find((x) => x.id === r.id), at: r.at })).filter((r): r is { t: Task; at: string } => !!r.t);
  const recent = [...projects].reverse().filter((p) => p.status !== 'completed').slice(0, 4); // yang terbaru dibuat lebih dulu
  const count = (n: number) => <span className="rounded-full bg-line-soft px-1.5 text-[11px] font-bold text-arang-muted">{n}</span>;

  return (
    <div className={shell}>
      <PageHeader eyebrow={`${greeting()}, ${me.shortName}`} title="Untuk Anda">
        <button type="button" className="btn btn-outline" onClick={() => setModal('project')}><FolderPlus size={15} />Proyek baru</button>
      </PageHeader>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-[15px] font-bold">Proyek terbaru</h2>
          <a href={href.dashboard} className="text-[13px] font-semibold">Lihat semua proyek</a>
        </div>
        {recent.length ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>
            {recent.map((p) => {
              const ts = tasks.filter((t) => t.projectId === p.id);
              const myOpen = ts.filter((t) => t.assigneeId === me.id && t.status !== 'done').length;
              const doneN = ts.filter((t) => t.status === 'done').length;
              const prefix = taskKey(ts[0]?.id ?? '').split('-')[0];
              return (
                <div key={p.id} className="card flex flex-col overflow-hidden transition-shadow hover:shadow-lift">
                  <span aria-hidden="true" className="h-1.5" style={{ background: 'linear-gradient(90deg,#0F9D8A,#F2B33D)' }} />
                  <div className="flex flex-col gap-3 p-4">
                    <a href={href.proyek(p.id)} className="flex items-center gap-3" style={{ color: '#1F2933' }}>
                      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold text-white" style={{ background: 'linear-gradient(135deg,#0F9D8A,#0B5F54)' }}>{p.name.trim().charAt(0).toUpperCase()}</span>
                      <span className="min-w-0 leading-tight"><span className="block truncate text-[14.5px] font-bold">{p.name}</span><span className="block text-xs text-arang-muted">Proyek{prefix && prefix !== 'TGS' ? ` · ${prefix}` : ''}</span></span>
                    </a>
                    <div className="flex flex-col gap-1 text-[13px]">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-arang-muted">Tautan cepat</span>
                      <a href={href.proyek(p.id, 'list')} className="flex justify-between" style={{ color: '#3D4750' }}><span>Tugas terbuka saya</span>{count(myOpen)}</a>
                      <a href={href.proyek(p.id, 'list')} className="flex justify-between" style={{ color: '#3D4750' }}><span>Tugas rampung</span>{count(doneN)}</a>
                    </div>
                    <div className="flex items-center gap-2"><div className="flex-1"><Progress value={pct(doneN, ts.length)} h={5} /></div><span className="text-[11.5px] font-semibold text-arang-muted">{pct(doneN, ts.length)}%</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card"><Empty title="Belum ada proyek" text="Buat proyek pertama untuk mulai mengatur pekerjaan tim."><button type="button" className="btn btn-primary mt-2" onClick={() => setModal('project')}>Mulai proyek pertama</button></Empty></div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <UnderlineTabs label="Pekerjaan Anda" value={tab} onChange={setTab} options={[
          { value: 'worked', label: 'Dikerjakan' },
          { value: 'viewed', label: 'Dilihat' },
          { value: 'assigned', label: <>Ditugaskan ke saya {count(assigned.length)}</> },
        ]} />
        {tab === 'assigned' && <WorkList checkable sections={[{ title: '', items: assigned.map((t) => ({ t })) }]} empty={<Empty title="Tidak ada tugas terbuka" text="Tugas yang ditugaskan kepada Anda akan muncul di sini." />} />}
        {tab === 'worked' && <WorkList sections={byWhen(workedRows, 'diperbarui')} empty={<Empty title="Belum ada pekerjaan" text="Tugas yang Anda buat, ubah, atau komentari akan muncul di sini." />} />}
        {tab === 'viewed' && <WorkList sections={byWhen(viewedRows, 'dilihat')} empty={<Empty title="Belum ada yang dilihat" text="Tiket yang Anda buka akan muncul di sini (tersimpan di peramban ini)." />} />}
      </section>
    </div>
  );
};

export const InboxPage: React.FC = () => {
  const { notifications, me, markAllRead } = useApp();
  const [tab, setTab] = useState('all');
  const mine = notifications.filter((n) => n.userId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unread = mine.filter((n) => !n.read);
  const list = tab === 'unread' ? unread : mine;
  return (
    <div className={shell}>
      <PageHeader title="Inbox" eyebrow={`${unread.length} belum dibaca`}>{unread.length > 0 && <button type="button" className="btn btn-outline" onClick={markAllRead}>Tandai semua terbaca</button>}</PageHeader>
      <UnderlineTabs label="Filter notifikasi" value={tab} onChange={setTab} options={[{ value: 'all', label: `Semua (${mine.length})` }, { value: 'unread', label: `Belum dibaca (${unread.length})` }]} />
      <div className="card p-1.5">
        {list.map((n) => <NotificationItem key={n.id} n={n} />)}
        {!list.length && <Empty title={tab === 'unread' ? 'Semua sudah dibaca' : 'Inbox kosong'} text="Sebutan, tugas baru, dan pengingat tenggat akan muncul di sini." />}
      </div>
    </div>
  );
};

export { fmtDayDate };
