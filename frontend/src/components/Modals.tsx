import React, { useEffect, useState } from 'react';
import { Check, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { go, href } from '../store/router';
import type { AutomationAction, AutomationTrigger, Plan, Priority, TaskStatus } from '../types';
import { Field, Modal, Pill } from './ui';
import { LABELS, MODULES, PLANS, PLAN_RANK, PRIORITY, STATUS, STATUS_ORDER } from '../lib/meta';
import { relDay, rupiah, todayISO } from '../lib/format';
import { TEMPLATES } from '../lib/templates';
import { api } from '../lib/api';

const CreateTask: React.FC = () => {
  const { createTaskOpen, closeCreateTask, projects, users, createTask, me } = useApp();
  const blank = { title: '', projectId: '', status: 'todo' as TaskStatus, priority: 'medium' as Priority, assigneeId: me.id, label: 'Manajemen', dueDate: relDay(3), description: '' };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (createTaskOpen) setF({ ...blank, projectId: createTaskOpen.projectId ?? projects[0]?.id ?? '', status: createTaskOpen.status ?? 'todo' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createTaskOpen]);
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!f.title.trim() || !f.projectId) return;
    const t = createTask({ ...f, title: f.title.trim(), startDate: todayISO() < f.dueDate ? todayISO() : f.dueDate });
    closeCreateTask();
    go(href.tugas(t.id));
  };
  return (
    <Modal open={!!createTaskOpen} onClose={closeCreateTask} title="Tugas baru" footer={<><button type="button" className="btn btn-outline" onClick={closeCreateTask}>Batal</button><button type="button" className="btn btn-primary" disabled={!f.title.trim()} onClick={() => submit()}>Buat tugas</button></>}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Judul tugas" htmlFor="nt"><input id="nt" autoFocus className="input" placeholder="Contoh: Desain halaman kontak" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Proyek" htmlFor="np"><select id="np" className="input" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</select></Field>
          <Field label="Kolom" htmlFor="ns"><select id="ns" className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as TaskStatus })}>{STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select></Field>
          <Field label="Penanggung jawab" htmlFor="na"><select id="na" className="input" value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <Field label="Tenggat" htmlFor="nd"><input id="nd" type="date" className="input" value={f.dueDate} onChange={(e) => e.target.value && setF({ ...f, dueDate: e.target.value })} /></Field>
          <Field label="Prioritas" htmlFor="npr"><select id="npr" className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>{(Object.keys(PRIORITY) as Priority[]).map((x) => <option key={x} value={x}>{PRIORITY[x].label}</option>)}</select></Field>
          <Field label="Label" htmlFor="nl"><select id="nl" className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })}>{Object.keys(LABELS).map((x) => <option key={x}>{x}</option>)}</select></Field>
        </div>
        <Field label="Deskripsi (opsional)" htmlFor="ndsc"><textarea id="ndsc" className="input min-h-[80px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <button type="submit" className="sr-only">Buat</button>
      </form>
    </Modal>
  );
};

const CreateProject: React.FC = () => {
  const { modal, setModal, createProject, spaces, clients, createSpace, me } = useApp();
  const [f, setF] = useState({ name: '', spaceId: '', clientId: '', dueDate: relDay(30), budget: '', newSpace: '', template: 'kosong' });
  const close = () => setModal(null);
  const open = modal === 'project';
  const submit = () => {
    if (!f.name.trim()) return;
    let spaceId = f.spaceId || spaces[0]?.id;
    if (f.newSpace.trim()) { createSpace(f.newSpace.trim()); spaceId = ''; }
    const p = createProject({ name: f.name.trim(), shortName: f.name.trim(), spaceId, clientId: f.clientId || undefined, dueDate: f.dueDate, budget: Number(f.budget) * 1_000_000 || 0, memberIds: [me.id] }, f.template);
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
        <Field label="Anggaran (juta rupiah, opsional)" htmlFor="pb"><input id="pb" type="number" min={0} className="input" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} /></Field>
      </div>
    </Modal>
  );
};

const Pricing: React.FC = () => {
  const { modal, setModal, workspace, upgradePlan, notify } = useApp();
  const [yearly, setYearly] = useState(false);
  const price = (m: number | null) => (m === null ? 'Hubungi kami' : m === 0 ? 'Rp0' : rupiah(yearly ? m * 10 : m));
  const choose = (p: Plan) => {
    if (p === 'enterprise') { notify('Tim kami akan menghubungi', 'Permintaan demo Enterprise dicatat (simulasi).'); return; }
    upgradePlan(p);
    setModal(null);
  };
  return (
    <Modal open={modal === 'pricing'} onClose={() => setModal(null)} title="Pilih paket Rampung" wide>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-arang-muted">Harga per pengguna, dalam rupiah. Pembayaran lewat QRIS dalam mode demo disimulasikan.</span>
          <div role="group" aria-label="Periode tagihan" className="inline-flex gap-1 rounded-[10px] bg-canvas-seg p-1 text-sm"><button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)} className="h-9 cursor-pointer rounded-lg border-0 px-3.5" style={!yearly ? { background: '#fff', fontWeight: 700 } : { background: 'transparent' }}>Bulanan</button><button type="button" aria-pressed={yearly} onClick={() => setYearly(true)} className="h-9 cursor-pointer rounded-lg border-0 px-3.5" style={yearly ? { background: '#fff', fontWeight: 700 } : { background: 'transparent' }}>Tahunan · hemat 2 bulan</button></div></div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          {PLANS.map((p) => { const cur = workspace.plan === p.key; return (
            <div key={p.key} className="flex flex-col gap-3 rounded-card bg-white p-4" style={{ border: p.popular ? '2px solid #0B7A6B' : '1px solid #E2E5E1' }}>
              <div className="flex items-center justify-between"><h3 className="m-0 text-base font-bold">{p.name}</h3>{p.popular && <Pill bg="#E3F3F0" fg="#0B5F54" className="font-bold">Populer</Pill>}</div>
              <div><div className="text-2xl font-extrabold">{price(p.monthly)}</div><div className="text-xs text-arang-muted">{p.monthly ? (yearly ? 'per pengguna per tahun' : p.unit) : p.unit}</div></div>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">{p.items.map((i) => <li key={i} className="flex gap-2"><Check size={14} color="#0B7A6B" className="mt-0.5 shrink-0" />{i}</li>)}</ul>
              <button type="button" disabled={cur} onClick={() => choose(p.key)} className={`btn mt-auto ${p.popular && !cur ? 'btn-primary' : 'btn-outline'}`}>{cur ? 'Paket saat ini' : PLAN_RANK[p.key] < PLAN_RANK[workspace.plan] ? 'Turun ke ' + p.name : p.cta}</button>
            </div>); })}
        </div>
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
  const { modal, setModal, automations, addAutomation, toggleAutomation, deleteAutomation } = useApp();
  const [f, setF] = useState({ trigger: 'status_changed' as AutomationTrigger, triggerValue: 'done' as TaskStatus, action: 'notify_assignee' as AutomationAction });
  const actionLabel: Record<AutomationAction, string> = { notify_assignee: 'kabari penanggung jawab', notify_whatsapp: 'kirim pengingat WhatsApp', notify_client: 'kabari klien lewat WhatsApp', set_priority_high: 'naikkan prioritas ke Tinggi' };
  const trigLabel = (t: AutomationTrigger, v?: TaskStatus) => (t === 'status_changed' ? `Status berubah ke ${STATUS[v ?? 'done'].label}` : t === 'task_created' ? 'Tugas dibuat' : 'Tenggat besok');
  return (
    <Modal open={modal === 'automation'} onClose={() => setModal(null)} title="Otomasi" wide>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2.5">
          {automations.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3.5"><div className="flex min-w-0 flex-col gap-0.5"><span className="text-sm font-bold">{a.name}</span><span className="text-xs text-arang-muted">Jalan {a.runCount} kali</span></div>
              <div className="flex items-center gap-2"><button type="button" role="switch" aria-checked={a.isActive} aria-label={a.name} onClick={() => toggleAutomation(a.id)} className="relative h-7 w-12 cursor-pointer rounded-full border-0" style={{ background: a.isActive ? '#0B7A6B' : '#C9CEC8' }}><span className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all" style={{ left: a.isActive ? 24 : 4 }} /></button><button type="button" aria-label="Hapus aturan" className="btn-icon" onClick={() => deleteAutomation(a.id)}><Trash2 size={15} /></button></div></div>
          ))}
          {!automations.length && <span className="text-sm text-arang-muted">Belum ada aturan.</span>}
        </div>
        <div className="flex flex-col gap-3 rounded-xl bg-canvas p-4"><h3 className="m-0 text-sm font-bold">Aturan baru: jika–maka</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Jika" htmlFor="at"><select id="at" className="input input-sm" value={f.trigger} onChange={(e) => setF({ ...f, trigger: e.target.value as AutomationTrigger })}><option value="status_changed">Status berubah</option><option value="task_created">Tugas dibuat</option><option value="due_soon">Tenggat besok</option></select></Field>
            <Field label="Ke status" htmlFor="av"><select id="av" className="input input-sm" disabled={f.trigger !== 'status_changed'} value={f.triggerValue} onChange={(e) => setF({ ...f, triggerValue: e.target.value as TaskStatus })}>{STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select></Field>
            <Field label="Maka" htmlFor="aa"><select id="aa" className="input input-sm" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value as AutomationAction })}>{(Object.keys(actionLabel) as AutomationAction[]).map((k) => <option key={k} value={k}>{actionLabel[k]}</option>)}</select></Field>
          </div>
          <button type="button" className="btn btn-primary self-start" onClick={() => addAutomation({ name: `${trigLabel(f.trigger, f.triggerValue)} → ${actionLabel[f.action]}`, trigger: f.trigger, triggerValue: f.trigger === 'status_changed' ? f.triggerValue : undefined, action: f.action })}>Simpan aturan</button>
        </div>
      </div>
    </Modal>
  );
};

const AI: React.FC = () => {
  const { modal, setModal, projects, createTask, notify } = useApp();
  const [idea, setIdea] = useState('');
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<{ title: string; label: string; days: number }[]>([]);
  const close = () => setModal(null);
  const gen = async () => {
    const x = idea.trim();
    if (!x) return;
    setLoading(true);
    try {
      const res = await api.aiBreakdown({ title: x });
      const daysOffset = [2, 5, 8, 12, 16, 20];
      setList(res.subtasks.map((s, idx) => ({
        title: s.title,
        label: res.suggestedLabel || 'Manajemen',
        days: daysOffset[idx % daysOffset.length],
      })));
      notify('Asisten AI Rampung', res.advice || 'Tugas berhasil dipecah.');
    } catch {
      // Fallback lokal jika backend tidak terjangkau
      setList([
        { title: `Riset kebutuhan: ${x}`, label: 'Riset', days: 3 },
        { title: `Susun ruang lingkup dan target: ${x}`, label: 'Manajemen', days: 5 },
        { title: `Desain konsep awal: ${x}`, label: 'Desain', days: 9 },
        { title: `Kerjakan implementasi: ${x}`, label: 'Backend', days: 16 },
        { title: `Siapkan konten dan materi: ${x}`, label: 'Konten', days: 18 },
        { title: `Uji dan perbaikan: ${x}`, label: 'Manajemen', days: 22 },
        { title: `Peluncuran dan laporan: ${x}`, label: 'Marketing', days: 25 },
      ]);
    } finally {
      setLoading(false);
    }
  };
  const add = () => {
    const pid = projectId || projects[0]?.id;
    if (!pid) return;
    list.forEach((t) => createTask({ projectId: pid, title: t.title, label: t.label, dueDate: relDay(t.days), status: 'todo' }));
    notify('Tugas dari AI ditambahkan', `${list.length} tugas masuk ke kolom Ide.`, 'success');
    setList([]); setIdea(''); close();
  };
  return (
    <Modal open={modal === 'ai'} onClose={close} title="Asisten AI" wide footer={list.length ? <><button type="button" className="btn btn-outline" onClick={() => setList([])}>Ulangi</button><button type="button" className="btn btn-primary" onClick={add}>Tambahkan {list.length} tugas</button></> : undefined}>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-sm text-arang-muted">Tulis ide, asisten memecahnya jadi daftar tugas. Mode demo: hasil dibuat dari template lokal, belum memakai model AI sungguhan.</p>
        <Field label="Ide kamu" htmlFor="ai-i"><textarea id="ai-i" className="input min-h-[80px]" placeholder="Contoh: landing page promo akhir tahun" value={idea} onChange={(e) => setIdea(e.target.value)} /></Field>
        <Field label="Masukkan ke proyek" htmlFor="ai-p"><select id="ai-p" className="input" value={projectId || projects[0]?.id} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</select></Field>
        <button type="button" className="btn btn-kunyit self-start" disabled={!idea.trim() || loading} onClick={gen}><Sparkles size={15} />{loading ? 'Menganalisis...' : 'Pecah jadi tugas (AI)'}</button>
        {list.length > 0 && <ol className="m-0 flex list-none flex-col gap-2 p-0">{list.map((t, i) => <li key={i} className="flex items-center justify-between gap-3 rounded-[10px] border border-line px-3.5 py-2.5 text-sm"><span className="font-semibold">{t.title}</span><span className="shrink-0 text-xs text-arang-muted">{t.label} · +{t.days} hari</span></li>)}</ol>}
      </div>
    </Modal>
  );
};

const WhatsApp: React.FC = () => {
  const { modal, setModal, workspace, updateWorkspace, notify, canUseModule } = useApp();
  const [num, setNum] = useState(workspace.whatsappNumber ?? '');
  const [sendingTest, setSendingTest] = useState(false);
  const ok = canUseModule('integrations');
  const close = () => setModal(null);

  const testMessage = async () => {
    if (!num) return;
    setSendingTest(true);
    try {
      await api.sendWhatsApp({
        phone: num,
        message: `Halo! Ini pesan uji coba dari sistem Rampung. Integrasi WhatsApp berhasil terhubung.`,
      });
      notify('WhatsApp terkirim', `Pesan uji coba terkirim ke ${num}`, 'wa');
    } catch (e: any) {
      notify('Gagal kirim pesan', e?.message || 'Pastikan backend berjalan.');
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <Modal open={modal === 'wa'} onClose={close} title="Notifikasi WhatsApp" footer={<><button type="button" className="btn btn-outline" onClick={close}>Tutup</button>{workspace.whatsappConnected ? <><button type="button" className="btn btn-primary" disabled={sendingTest} onClick={testMessage}>{sendingTest ? 'Mengirim...' : 'Uji Coba Pesan'}</button><button type="button" className="btn btn-outline" onClick={() => { updateWorkspace({ whatsappConnected: false }); notify('WhatsApp diputus'); }}>Putuskan</button></> : <button type="button" className="btn btn-primary" disabled={!ok || num.replace(/\D/g, '').length < 9} onClick={() => { updateWorkspace({ whatsappConnected: true, whatsappNumber: num }); testMessage(); notify('WhatsApp terhubung', 'Gateway WhatsApp aktif.', 'wa'); close(); }}>Hubungkan</button>}</>}>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-sm text-arang-body">Kirim pengingat tenggat, @mention, dan invoice langsung ke WhatsApp pengguna melalui Rampung WA Gateway.</p>
        {!ok && <div className="rounded-xl bg-kunyit-soft p-3 text-sm" style={{ color: '#6B4A00' }}>Integrasi WhatsApp tersedia di paket Bisnis. <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-bold underline" onClick={() => setModal('pricing')}>Lihat paket</button></div>}
        <Field label="Nomor WhatsApp Business" htmlFor="wa-n"><input id="wa-n" className="input" placeholder="0812xxxxxxxx" value={num} onChange={(e) => setNum(e.target.value)} disabled={workspace.whatsappConnected} /></Field>
        {workspace.whatsappConnected && (
          <div className="flex flex-col gap-2">
            <Pill bg="#E3F3F0" fg="#0B5F54" className="self-start font-bold">Terhubung · {workspace.whatsappNumber}</Pill>
            <span className="text-xs text-arang-muted">Gateway aktif di server Node.js. Anda dapat mengirim pesan uji coba sekarang.</span>
          </div>
        )}
      </div>
    </Modal>
  );
};

export const GlobalModals: React.FC = () => (<><CreateTask /><CreateProject /><Pricing /><Modules /><Automation /><AI /><WhatsApp /></>);
