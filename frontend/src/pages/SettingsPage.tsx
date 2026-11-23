import React, { useCallback, useEffect, useState } from 'react';
import { Copy, MessageCircle, Trash2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { go, href } from '../store/router';
import { Avatar, Field, PageHeader, Pill, Progress } from '../components/ui';
import { ApiError, api } from '../lib/api';
import type { ApiInvite, ApiMember, Role } from '../lib/api';
import { pct } from '../lib/format';

const ROLE_LABEL: Record<string, string> = { owner: 'Pemilik', admin: 'Admin', member: 'Anggota', client: 'Klien' };
const inviteLink = (t: string) => `${window.location.origin}/${href.gabung(t)}`;

export const SettingsPage: React.FC = () => {
  const { workspace, users, me, mode, account, setModal, resetDemo, projects, updateWorkspace, renameMe, removeMemberRecord, notify } = useApp();
  const plan = workspace.plan.charAt(0).toUpperCase() + workspace.plan.slice(1);
  const isAdmin = me.role === 'owner' || me.role === 'admin';
  const isOwner = me.role === 'owner';
  const server = mode === 'server';

  const [wsName, setWsName] = useState(workspace.name);
  const [myName, setMyName] = useState(me.name);
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [invites, setInvites] = useState<ApiInvite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ email: string; token: string; emailed: boolean } | null>(null);

  const reload = useCallback(async () => {
    if (!server) return;
    try {
      const [m, i] = await Promise.all([api.members(), isAdmin ? api.invites() : Promise.resolve({ invites: [] as ApiInvite[] })]);
      setMembers(m.members);
      setInvites(i.invites);
    } catch { /* tampil kosong jika server tidak terjangkau */ }
  }, [server, isAdmin]);
  useEffect(() => { reload(); }, [reload]);

  const fail = (e: unknown) => notify('Gagal', e instanceof ApiError ? e.message : 'Terjadi kesalahan.');
  const roleOf = (userId: string): Role | undefined => members.find((m) => `u${m.id}` === userId)?.role;
  const accId = (userId: string) => (userId.startsWith('u') ? Number(userId.slice(1)) : NaN);

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.invite(email.trim(), role);
      setFresh({ email: r.email, token: r.token, emailed: r.emailed });
      setEmail('');
      reload();
    } catch (ex) { fail(ex); } finally { setBusy(false); }
  };
  const copy = (t: string) => { navigator.clipboard?.writeText(inviteLink(t)); notify('Tautan undangan disalin', undefined, 'success'); };
  const wa = (t: string, to: string) => window.open(`https://wa.me/?text=${encodeURIComponent(`Halo, kamu diundang bergabung ke ${workspace.name} di Rampung. Daftar lewat tautan ini (khusus ${to}): ${inviteLink(t)}`)}`, '_blank', 'noopener');

  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-8">
      <PageHeader eyebrow="Workspace" title="Pengaturan" />

      <section className="card flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex flex-col gap-1"><span className="text-[13px] text-arang-muted">Paket saat ini</span><span className="text-xl font-extrabold">{plan}</span><span className="text-[13px] text-arang-muted">{workspace.name} · {users.length} anggota · {projects.length} proyek</span></div><button type="button" className="btn btn-primary" onClick={() => setModal('pricing')}>Ubah paket</button></section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card flex flex-col gap-3 p-5"><h2 className="card-title">Profil saya</h2>
          <Field label="Nama" htmlFor="my-name"><input id="my-name" className="input" value={myName} onChange={(e) => setMyName(e.target.value)} /></Field>
          <span className="text-[13px] text-arang-muted">{account?.email ?? me.email} · {ROLE_LABEL[me.role]}</span>
          <button type="button" className="btn btn-outline self-start" disabled={!myName.trim() || myName.trim() === me.name} onClick={() => renameMe(myName).catch(fail)}>Simpan nama</button>
        </section>
        <section className="card flex flex-col gap-3 p-5"><h2 className="card-title">Workspace</h2>
          <Field label="Nama workspace" htmlFor="ws-name"><input id="ws-name" className="input" value={wsName} disabled={!isAdmin} onChange={(e) => setWsName(e.target.value)} /></Field>
          <span className="text-[13px] text-arang-muted">{isAdmin ? 'Nama tampil di sidebar dan di portal klien.' : 'Hanya pemilik atau admin yang bisa mengubah.'}</span>
          <button type="button" className="btn btn-outline self-start" disabled={!isAdmin || !wsName.trim() || wsName.trim() === workspace.name} onClick={() => { updateWorkspace({ name: wsName.trim() }); notify('Nama workspace diperbarui', undefined, 'success'); }}>Simpan</button>
        </section>
      </div>

      <section className="card flex flex-col gap-4 p-5"><h2 className="card-title">Anggota tim</h2>
        <div className="flex flex-col">
          {users.map((u) => {
            const r = (u.id === me.id ? me.role : roleOf(u.id)) ?? u.role;
            const real = server && !u.demo && !Number.isNaN(accId(u.id));
            return (
              <div key={u.id} className="flex flex-wrap items-center gap-3 border-t border-line-soft py-3 first:border-0 first:pt-0">
                <Avatar userId={u.id} size={36} />
                <div className="min-w-0 flex-1 text-sm"><div className="font-bold">{u.name}{u.id === me.id && <span className="font-normal text-arang-muted"> (kamu)</span>}</div><div className="truncate text-arang-muted">{u.email || 'tanpa email'}</div></div>
                {u.demo && <Pill bg="#FDF3DC" fg="#6B4A00" className="font-bold">Contoh</Pill>}
                {real && isOwner && r !== 'owner' ? (
                  <><label className="sr-only" htmlFor={`r-${u.id}`}>Peran {u.name}</label><select id={`r-${u.id}`} className="input input-sm w-auto" value={r} onChange={(e) => api.setRole(accId(u.id), e.target.value as 'admin' | 'member').then(() => { notify('Peran diperbarui', undefined, 'success'); reload(); }).catch(fail)}><option value="admin">Admin</option><option value="member">Anggota</option></select></>
                ) : <Pill bg="#ECEEEA" fg="#3D4750" className="font-bold">{ROLE_LABEL[r]}</Pill>}
                {isAdmin && u.id !== me.id && r !== 'owner' && (u.demo || real) && (
                  <button type="button" aria-label={`Keluarkan ${u.name}`} className="btn-icon" onClick={() => { if (!window.confirm(`Keluarkan ${u.name} dari workspace?`)) return; (u.demo ? Promise.resolve() : api.removeMember(accId(u.id))).then(() => { removeMemberRecord(u.id); notify('Anggota dikeluarkan'); reload(); }).catch(fail); }}><Trash2 size={15} /></button>
                )}
              </div>
            );
          })}
        </div>

        {server && isAdmin && (
          <div className="flex flex-col gap-3 rounded-xl bg-canvas p-4">
            <h3 className="m-0 text-sm font-bold">Undang anggota baru</h3>
            <form onSubmit={sendInvite} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1"><Field label="Email" htmlFor="inv-email"><input id="inv-email" type="email" required className="input input-sm h-11" placeholder="nama@perusahaan.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Field></div>
              <Field label="Peran" htmlFor="inv-role"><select id="inv-role" className="input input-sm h-11" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')}><option value="member">Anggota</option><option value="admin">Admin</option></select></Field>
              <button type="submit" className="btn btn-primary" disabled={busy}>Buat undangan</button>
            </form>
            {fresh && (
              <div className="flex flex-col gap-2 rounded-lg border border-line bg-white p-3 text-sm">
                <span className="font-semibold">Tautan untuk {fresh.email}</span>
                <code className="break-all rounded bg-canvas px-2 py-1 text-xs">{inviteLink(fresh.token)}</code>
                <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-outline btn-sm" onClick={() => copy(fresh.token)}><Copy size={14} />Salin tautan</button><button type="button" className="btn btn-outline btn-sm" onClick={() => wa(fresh.token, fresh.email)}><MessageCircle size={14} />Bagikan lewat WhatsApp</button></div>
                <span className="text-xs text-arang-muted">{fresh.emailed ? `Email undangan sudah dikirim ke ${fresh.email}. ` : 'Email gagal dikirim; bagikan tautan ini secara manual. '}Tautan hanya berlaku untuk email tersebut.</span>
              </div>
            )}
            {invites.length > 0 && (
              <div className="flex flex-col"><span className="mb-1 text-xs font-bold text-arang-muted">UNDANGAN MENUNGGU</span>
                {invites.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-2 text-sm"><span>{i.email} <span className="text-arang-muted">· {ROLE_LABEL[i.role]}</span></span>
                    <span className="flex gap-2"><button type="button" className="btn btn-outline btn-sm" onClick={() => copy(i.token)}><Copy size={14} />Salin</button><button type="button" aria-label={`Batalkan undangan ${i.email}`} className="btn-icon" onClick={() => api.revokeInvite(i.id).then(reload).catch(fail)}><Trash2 size={15} /></button></span></div>
                ))}
              </div>
            )}
          </div>
        )}
        {!server && <span className="text-[13px] text-arang-muted">Undangan anggota hanya tersedia setelah masuk dengan akun (bukan mode lokal).</span>}
      </section>

      <section className="card flex flex-col gap-3 p-5"><h2 className="card-title">Penyimpanan</h2><Progress value={pct(workspace.storageUsedMB, workspace.storageMaxMB)} h={8} /><span className="text-[13px] text-arang-muted">{workspace.storageUsedMB} MB dari {Math.round(workspace.storageMaxMB / 1024)} GB terpakai</span></section>
      <section className="card flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex flex-col gap-1"><h2 className="card-title">Integrasi</h2><span className="text-[13px] text-arang-muted">WhatsApp, ekspor kalender, dan token API.</span></div><a className="btn btn-outline" href={href.integrasi}>Buka Integrasi</a></section>
      {isAdmin && <section className="card flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex flex-col gap-1"><h2 className="card-title">Data demo</h2><span className="max-w-lg text-[13px] text-arang-muted">Mengembalikan seluruh data workspace ke data contoh Studio Nusa. Data yang ada akan terhapus.</span></div><button type="button" className="btn btn-outline" onClick={() => { if (window.confirm('Kembalikan SEMUA data workspace ke data demo awal? Data saat ini akan hilang.')) { resetDemo(); go(href.beranda); } }}>Reset data demo</button></section>}
    </div>
  );
};
