import React, { useEffect, useState } from 'react';
import { Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { go, href } from '../store/router';
import type { AutomationAction, AutomationTrigger, Priority, TaskStatus } from '../types';
import { Field, Modal, Pill, PriorityIcon } from './ui';
import { LABELS, MODULES, PRIORITY, STATUS, STATUS_ORDER } from '../lib/meta';
import { relDay, todayISO, errMsg } from '../lib/format';
import { TEMPLATES } from '../lib/templates';
import { Pricing } from './Pricing';
import { api } from '../lib/api';

const CreateTask: React.FC = () => {
  const { createTaskOpen } = useApp();
  // Formulir dipasang ulang setiap dialog dibuka, sehingga nilai awal ditetapkan SAAT render pertama
  // (bukan lewat useEffect yang bisa kalah balapan dengan ketikan pertama pengguna).
  return createTaskOpen ? <CreateTaskDialog opts={createTaskOpen} /> : null;
};

const CreateTaskDialog: React.FC<{ opts: { projectId?: string; status?: TaskStatus } }> = ({ opts }) => {
  const { closeCreateTask, projects, users, createTask, me, notify } = useApp();
  const blank = (projectId: string) => ({
    title: '',
    projectId,
    status: opts.status ?? ('todo' as TaskStatus),
    priority: 'medium' as Priority,
    assigneeId: me.id,
    label: 'Manajemen',
    dueDate: relDay(3),
    estimatedHours: '' as string,
    isMilestone: false,
    description: '',
  });
  const [f, setF] = useState(() => blank(opts.projectId && projects.some((p) => p.id === opts.projectId) ? opts.projectId : projects[0]?.id ?? ''));
  const [another, setAnother] = useState(false);
  const [tried, setTried] = useState(false);
  // Pembaruan fungsional: tidak pernah menimpa perubahan lain dengan salinan state yang sudah usang.
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const ready = f.title.trim().length > 0 && projects.some((p) => p.id === f.projectId);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (!ready) return;
    const { estimatedHours, ...rest } = f;
    const t = createTask({ ...rest, title: f.title.trim(), estimatedHours: estimatedHours ? Number(estimatedHours) : undefined, startDate: todayISO() < f.dueDate ? todayISO() : f.dueDate });
    if (another) {
      setF((prev) => ({ ...blank(prev.projectId), status: prev.status, assigneeId: prev.assigneeId, label: prev.label }));
      setTried(false);
      notify('Tugas dibuat', 'Silakan isi tugas berikutnya.', 'success');
      document.getElementById('nt')?.focus();
      return;
    }
    closeCreateTask();
    go(href.tugas(t.id));
  };

  const row = 'grid gap-1.5 sm:grid-cols-[150px_minmax(0,360px)] sm:items-center sm:gap-4';
  const lbl = 'text-[13px] font-semibold text-arang-body';

  return (
    <Modal
      open
      wide
      onClose={closeCreateTask}
      title="Buat tugas"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-arang-body"><input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} style={{ accentColor: '#0B7A6B' }} />Buat tugas lain setelah ini</label>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={closeCreateTask}>Batal</button>
            <button type="button" className="btn btn-primary" disabled={!projects.length} onClick={() => submit()}>Buat tugas</button>
          </div>
        </div>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="m-0 text-xs text-arang-muted">Kolom bertanda <span style={{ color: '#B42318' }}>*</span> wajib diisi.</p>
        {!projects.length && <span role="alert" className="text-sm font-semibold" style={{ color: '#8A5A00' }}>Buat proyek terlebih dahulu sebelum menambah tugas.</span>}

        <div className={row}>
          <label htmlFor="np" className={lbl}>Proyek <span style={{ color: '#B42318' }}>*</span></label>
          <select id="np" className="input" value={f.projectId} onChange={(e) => set('projectId', e.target.value)}>{!projects.some((p) => p.id === f.projectId) && <option value="">Pilih proyek…</option>}{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div>
        <div className={row}>
          <label htmlFor="ntype" className={lbl}>Jenis tugas</label>
          <div className="flex items-center gap-2">
            <select id="ntype" className="input" value={f.isMilestone ? 'milestone' : 'task'} onChange={(e) => set('isMilestone', e.target.value === 'milestone')}><option value="task">Tugas</option><option value="milestone">Milestone</option></select>
          </div>
        </div>

        <hr className="my-1 border-0 border-t border-line-soft" />

        <div className={row}>
          <label htmlFor="ns" className={lbl}>Status awal</label>
          <select id="ns" className="input" value={f.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>{STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="nt" className={lbl}>Ringkasan <span style={{ color: '#B42318' }}>*</span></label>
          <input id="nt" autoFocus className="input" maxLength={200} placeholder="Contoh: Desain halaman kontak" value={f.title} onChange={(e) => set('title', e.target.value)} aria-invalid={tried && !f.title.trim()} style={tried && !f.title.trim() ? { borderColor: '#B42318' } : undefined} />
          {tried && !f.title.trim() && <span role="alert" className="text-xs font-semibold" style={{ color: '#B42318' }}>Ringkasan wajib diisi.</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ndsc" className={lbl}>Deskripsi</label>
          <textarea id="ndsc" className="input min-h-[110px]" placeholder="Jelaskan tujuan, langkah, atau kriteria selesai…" value={f.description} onChange={(e) => set('description', e.target.value)} />
        </div>

        <div className={row}>
          <label htmlFor="na" className={lbl}>Penanggung jawab</label>
          <div className="flex flex-col items-start gap-1">
            <select id="na" className="input" value={f.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            {f.assigneeId !== me.id && <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-brand hover:underline" onClick={() => set('assigneeId', me.id)}>Tugaskan ke saya</button>}
          </div>
        </div>
        <div className={row}>
          <label htmlFor="npr" className={lbl}>Prioritas</label>
          <div className="flex items-center gap-2"><PriorityIcon priority={f.priority} /><select id="npr" className="input" value={f.priority} onChange={(e) => set('priority', e.target.value as Priority)}>{(Object.keys(PRIORITY) as Priority[]).map((x) => <option key={x} value={x}>{PRIORITY[x].label}</option>)}</select></div>
        </div>
        <div className={row}>
          <label htmlFor="nl" className={lbl}>Label</label>
          <select id="nl" className="input" value={f.label} onChange={(e) => set('label', e.target.value)}>{Object.keys(LABELS).map((x) => <option key={x}>{x}</option>)}</select>
        </div>
        <div className={row}>
          <label htmlFor="nd" className={lbl}>Tenggat</label>
          <input id="nd" type="date" className="input" value={f.dueDate} onChange={(e) => e.target.value && set('dueDate', e.target.value)} />
        </div>
        <div className={row}>
          <label htmlFor="nest" className={lbl}>Estimasi (jam)</label>
          <input id="nest" type="number" min={0} step={0.5} className="input" placeholder="mis. 4" value={f.estimatedHours} onChange={(e) => set('estimatedHours', e.target.value)} />
        </div>
        <button type="submit" className="sr-only">Buat</button>
      </form>
    </Modal>
  );
};

const CreateProject: React.FC = () => {
  const { modal, setModal, createProject, spaces, clients, createSpace, me, canManage } = useApp();
  const [f, setF] = useState({ name: '', spaceId: '', clientId: '', dueDate: relDay(30), budget: '', newSpace: '', template: 'kosong' });
  const close = () => setModal(null);
  const open = modal === 'project';
  const submit = () => {
    if (!f.name.trim()) return;
    let spaceId = f.spaceId || spaces[0]?.id;
    if (f.newSpace.trim()) spaceId = createSpace(f.newSpace.trim());
    const p = createProject({ name: f.name.trim(), shortName: f.name.trim(), spaceId, clientId: f.clientId || undefined, dueDate: f.dueDate, budget: Number(f.budget) * 1_000_000 || 0, memberIds: [me.id] }, f.template);
    if (!p) return;
    setF({ name: '', spaceId: '', clientId: '', dueDate: relDay(30), budget: '', newSpace: '', template: 'kosong' });
    close();
    go(href.proyek(p.id));
  };
  return (
    <Modal open={open} onClose={close} title="Proyek baru" footer={<><button type="button" className="btn btn-outline" onClick={close}>Batal</button><button type="button" className="btn btn-primary" disabled={!f.name.trim()} onClick={submit}>Buat proyek</button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Nama proyek" htmlFor="pn"><input id="pn" autoFocus className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Space" htmlFor="psp"><select id="psp" className="input" value={f.spaceId} onChange={(e) => setF({ ...f, spaceId: e.target.value })}>{spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Atau space baru" htmlFor="pns"><input id="pns" className="input" placeholder="Nama space" value={f.newSpace} onChange={(e) => setF({ ...f, newSpace: e.target.value })} /></Field>
          <Field label="Klien (opsional)" htmlFor="pc"><select id="pc" className="input" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}><option value="">–</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</select></Field>
          <Field label="Tenggat" htmlFor="pd"><input id="pd" type="date" className="input" value={f.dueDate} onChange={(e) => e.target.value && setF({ ...f, dueDate: e.target.value })} /></Field>
        </div>
        <Field label="Template" htmlFor="ptpl" hint={TEMPLATES.find((t) => t.key === f.template)?.desc}><select id="ptpl" className="input" value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })}>{TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></Field>
        {canManage && <Field label="Anggaran (juta rupiah, opsional)" htmlFor="pb"><input id="pb" type="number" min={0} className="input" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} /></Field>}
      </div>
    </Modal>
  );
};

const Modules: React.FC = () => {
  const { modal, setModal, workspace, toggleModule, canUseModule } = useApp();
  return (
    <Modal open={modal === 'modules'} onClose={() => setModal(null)} title="Toko modul" wide>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-sm text-arang-muted">Modul inti selalu aktif. Nyalakan modul bisnis hanya yang tim kamu butuhkan. Paket Pro: 1 modul bisnis, Bisnis: semua.</p>
        {MODULES.map((m) => { const on = workspace.enabledModules[m.key]; const ok = canUseModule(m.key); return (
          <div key={m.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
            <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5"><span className="flex items-center gap-2 font-bold">{m.name}{!ok && <Pill bg="#ECEEEA" fg="#3D4750" className="font-bold">{m.minPlan === 'bisnis' ? 'BISNIS' : 'PRO'}</Pill>}</span><span className="text-[13px] text-arang-muted">{m.desc}</span></div>
            <button type="button" role="switch" aria-checked={on} aria-label={m.name} onClick={() => toggleModule(m.key)} className="relative h-7 w-12 cursor-pointer rounded-full border-0" style={{ background: on ? '#0B7A6B' : '#C9CEC8' }}><span className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all" style={{ left: on ? 24 : 4 }} /></button>
          </div>); })}
      </div>
    </Modal>
  );
};

const Automation: React.FC = () => {
  const { modal, setModal, automations, addAutomation, toggleAutomation, deleteAutomation, integrations } = useApp();
  const [f, setF] = useState({ trigger: 'status_changed' as AutomationTrigger, triggerValue: 'done' as TaskStatus, action: 'notify_assignee' as AutomationAction });
  const actionLabel: Record<AutomationAction, string> = { notify_assignee: 'kabari penanggung jawab', notify_whatsapp: 'kirim pengingat WhatsApp', notify_client: 'kabari klien lewat WhatsApp', set_priority_high: 'naikkan prioritas ke Tinggi' };
  const isWa = (a: AutomationAction) => a === 'notify_whatsapp' || a === 'notify_client';
  // "Tenggat besok" dijalankan server dan belum mengirim WhatsApp.
  const waOff = (t: AutomationTrigger) => !integrations?.whatsapp.configured || t === 'due_soon';
  const trigLabel = (t: AutomationTrigger, v?: TaskStatus) => (t === 'status_changed' ? `Status berubah ke ${STATUS[v ?? 'done'].label}` : t === 'task_created' ? 'Tugas dibuat' : 'Tenggat besok');
  return (
    <Modal open={modal === 'automation'} onClose={() => setModal(null)} title="Otomasi" wide>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2.5">
          {automations.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3.5"><div className="flex min-w-0 flex-col gap-0.5"><span className="text-sm font-bold">{a.name}</span><span className="text-xs text-arang-muted">Jalan {a.runCount} kali{isWa(a.action) && waOff(a.trigger) ? ' · dilewati selama WhatsApp belum aktif' : ''}</span></div>
              <div className="flex items-center gap-2"><button type="button" role="switch" aria-checked={a.isActive} aria-label={a.name} onClick={() => toggleAutomation(a.id)} className="relative h-7 w-12 cursor-pointer rounded-full border-0" style={{ background: a.isActive ? '#0B7A6B' : '#C9CEC8' }}><span className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all" style={{ left: a.isActive ? 24 : 4 }} /></button><button type="button" aria-label="Hapus aturan" className="btn-icon" onClick={() => deleteAutomation(a.id)}><Trash2 size={15} /></button></div></div>
          ))}
          {!automations.length && <span className="text-sm text-arang-muted">Belum ada aturan.</span>}
        </div>
        <div className="flex flex-col gap-3 rounded-xl bg-canvas p-4"><h3 className="m-0 text-sm font-bold">Aturan baru: jika–maka</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Jika" htmlFor="at"><select id="at" className="input input-sm" value={f.trigger} onChange={(e) => { const trigger = e.target.value as AutomationTrigger; setF({ ...f, trigger, action: isWa(f.action) && waOff(trigger) ? 'notify_assignee' : f.action }); }}><option value="status_changed">Status berubah</option><option value="task_created">Tugas dibuat</option><option value="due_soon">Tenggat besok</option></select></Field>
            <Field label="Ke status" htmlFor="av"><select id="av" className="input input-sm" disabled={f.trigger !== 'status_changed'} value={f.triggerValue} onChange={(e) => setF({ ...f, triggerValue: e.target.value as TaskStatus })}>{STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select></Field>
            <Field label="Maka" htmlFor="aa"><select id="aa" className="input input-sm" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value as AutomationAction })}>{(Object.keys(actionLabel) as AutomationAction[]).filter((k) => !isWa(k) || !waOff(f.trigger)).map((k) => <option key={k} value={k}>{actionLabel[k]}</option>)}</select></Field>
          </div>
          <button type="button" className="btn btn-primary self-start" onClick={() => addAutomation({ name: `${trigLabel(f.trigger, f.triggerValue)} → ${actionLabel[f.action]}`, trigger: f.trigger, triggerValue: f.trigger === 'status_changed' ? f.triggerValue : undefined, action: f.action })}>Simpan aturan</button>
        </div>
      </div>
    </Modal>
  );
};

const AI: React.FC = () => {
  const { modal, setModal, projects, createTask, notify, mode, integrations } = useApp();
  const [idea, setIdea] = useState('');
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [source, setSource] = useState<{ kind: 'ai' | 'template'; model?: string } | null>(null);
  const [list, setList] = useState<{ title: string; label: string; days: number }[]>([]);
  const close = () => setModal(null);

  const gen = async () => {
    const x = idea.trim();
    if (!x) return;
    setLoading(true);
    setErr('');
    setList([]);
    try {
      const res = await api.aiBreakdown({ title: x });
      // Jadwal usulan: dibagi merata dari 2 hari ke depan sampai ~3 minggu, sesuai jumlah langkah.
      const n = res.subtasks.length;
      setList(res.subtasks.map((s, i) => ({ title: s.title, label: res.suggestedLabel || 'Manajemen', days: n > 1 ? Math.round(2 + (i * 19) / (n - 1)) : 7 })));
      setSource({ kind: res.source, model: res.model });
    } catch (e) {
      setSource(null);
      setErr(mode === 'server' ? errMsg(e) : 'Asisten hanya tersedia setelah masuk dengan akun.');
    } finally {
      setLoading(false);
    }
  };
  const add = () => {
    const pid = projectId || projects[0]?.id;
    if (!pid) return;
    list.forEach((t) => createTask({ projectId: pid, title: t.title, label: t.label, dueDate: relDay(t.days), status: 'todo' }));
    notify('Tugas ditambahkan', `${list.length} tugas masuk ke kolom Ide.`, 'success');
    setList([]); setIdea(''); setSource(null); close();
  };
  const aiOn = integrations?.ai.configured === true;
  return (
    <Modal open={modal === 'ai'} onClose={close} title="Asisten AI" wide footer={list.length ? <><button type="button" className="btn btn-outline" onClick={() => setList([])}>Ulangi</button><button type="button" className="btn btn-primary" onClick={add}>Tambahkan {list.length} tugas</button></> : undefined}>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-sm text-arang-muted">
          Tulis ide, lalu pecah jadi daftar tugas.{' '}
          {mode !== 'server' ? 'Perlu masuk dengan akun.' : integrations === null ? '' : aiOn ? `Dihasilkan oleh model ${integrations.ai.model}.` : 'AI belum dikonfigurasi di server, jadi hasilnya dari template kata kunci (bukan AI).'}
        </p>
        <Field label="Ide kamu" htmlFor="ai-i"><textarea id="ai-i" className="input min-h-[80px]" maxLength={200} placeholder="Contoh: landing page promo akhir tahun" value={idea} onChange={(e) => setIdea(e.target.value)} /></Field>
        <Field label="Masukkan ke proyek" htmlFor="ai-p"><select id="ai-p" className="input" value={projectId || projects[0]?.id} onChange={(e) => setProjectId(e.target.value)} disabled={!projects.length}>{projects.length ? projects.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>) : <option>Belum ada proyek</option>}</select></Field>
        <button type="button" className="btn btn-kunyit self-start" disabled={!idea.trim() || loading || !projects.length} onClick={gen}><Sparkles size={15} />{loading ? 'Menganalisis...' : aiOn ? 'Pecah jadi tugas (AI)' : 'Pecah jadi tugas'}</button>
        {err && <span role="alert" className="text-sm font-semibold" style={{ color: '#B42318' }}>{err}</span>}
        {source && <Pill bg={source.kind === 'ai' ? '#E3F3F0' : '#FDF3DC'} fg={source.kind === 'ai' ? '#0B5F54' : '#6B4A00'} className="self-start font-bold">{source.kind === 'ai' ? `Dihasilkan AI · ${source.model}` : 'Template kata kunci, bukan AI'}</Pill>}
        {list.length > 0 && <ol className="m-0 flex list-none flex-col gap-2 p-0">{list.map((t, i) => <li key={i} className="flex items-center justify-between gap-3 rounded-[10px] border border-line px-3.5 py-2.5 text-sm"><span className="font-semibold">{t.title}</span><span className="shrink-0 text-xs text-arang-muted">{t.label} · tenggat +{t.days} hari</span></li>)}</ol>}
      </div>
    </Modal>
  );
};

const WhatsApp: React.FC = () => {
  const { modal, setModal, notify, canManage, mode, integrations, refreshIntegrations } = useApp();
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState('');
  const close = () => setModal(null);
  const wa = integrations?.whatsapp;
  const open = modal === 'wa';

  useEffect(() => { if (open) void refreshIntegrations(); }, [open, refreshIntegrations]);

  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setResult('');
    try {
      const r = await api.sendWhatsApp({ phone: to, message: 'Pesan uji dari Rampung: integrasi WhatsApp Anda tersambung.' });
      setResult(`Diterima WhatsApp untuk ${r.to} (ID ${r.messageId}). Penerima harus pernah menghubungi nomor bisnis dalam 24 jam terakhir agar pesan teks bebas sampai.`);
      notify('Diterima WhatsApp', `Pesan uji untuk ${r.to}.`, 'wa');
    } catch (ex) {
      setErr(errMsg(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="WhatsApp" footer={<button type="button" className="btn btn-outline" onClick={close}>Tutup</button>}>
      <div className="flex flex-col gap-4">
        {mode !== 'server' ? (
          <p className="m-0 text-sm text-arang-body">WhatsApp hanya tersedia setelah masuk dengan akun.</p>
        ) : !wa ? (
          <p className="m-0 text-sm text-arang-muted" role="status">Memeriksa status server…</p>
        ) : !wa.configured ? (
          <>
            <Pill bg="#ECEEEA" fg="#3D4750" className="self-start font-bold">Belum dikonfigurasi</Pill>
            <p className="m-0 text-sm leading-relaxed text-arang-body">Server belum terhubung ke WhatsApp Business Cloud API (Meta). Isi dua variabel ini di <code>backend-node/.env</code>, lalu mulai ulang backend:</p>
            <code className="block rounded-lg bg-canvas p-3 text-xs">WHATSAPP_TOKEN=...{'\n'}WHATSAPP_PHONE_NUMBER_ID=...</code>
          </>
        ) : (
          <>
            {wa.reachable === false ? <Pill bg="#FDF3DC" fg="#6B4A00" className="self-start font-bold">Dikonfigurasi, tetapi Meta tidak terjangkau</Pill> : <Pill bg="#E3F3F0" fg="#0B5F54" className="self-start font-bold">Terhubung{wa.phoneNumber ? ` · ${wa.phoneNumber}` : ''}{wa.accountName ? ` · ${wa.accountName}` : ''}</Pill>}
            {canManage ? (
              <form onSubmit={sendTest} className="flex flex-col gap-3">
                <Field label="Kirim pesan uji ke nomor" htmlFor="wa-n" hint="Pesan sungguhan dikirim lewat nomor bisnis Anda.">
                  <input id="wa-n" className="input" inputMode="tel" placeholder="0812xxxxxxxx" value={to} onChange={(e) => setTo(e.target.value)} />
                </Field>
                <button type="submit" className="btn btn-primary self-start" disabled={busy || !to.trim()}>{busy ? 'Mengirim...' : 'Kirim pesan uji'}</button>
              </form>
            ) : (
              <p className="m-0 text-sm text-arang-muted">Hanya pemilik atau admin yang dapat mengirim pesan.</p>
            )}
            {err && <span role="alert" className="text-sm font-semibold" style={{ color: '#B42318' }}>{err}</span>}
            {result && <span role="status" className="text-sm" style={{ color: '#0B5F54' }}>{result}</span>}
          </>
        )}
      </div>
    </Modal>
  );
};

import { CommandPalette } from './CommandPalette';

export const GlobalModals: React.FC = () => (
  <>
    <CreateTask />
    <CreateProject />
    <Pricing />
    <Modules />
    <Automation />
    <AI />
    <WhatsApp />
    <CommandPalette />
  </>
);
