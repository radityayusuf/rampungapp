import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Copy, MessageCircle, QrCode, Send, Sparkles, Trash2, Webhook } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { Empty, Field, PageHeader, Pill } from '../components/ui';
import { API_BASE, api } from '../lib/api';
import type { ApiToken } from '../lib/api';
import { buildIcs, downloadFile } from '../lib/ics';
import { errMsg, fmtDateLong } from '../lib/format';
import { href } from '../store/router';

/** Lencana status yang mencerminkan kenyataan di server, bukan klaim tetap. */
const Status: React.FC<{ state: 'on' | 'off' | 'warn' | 'unknown'; children: React.ReactNode }> = ({ state, children }) => {
  const c = { on: ['#E3F3F0', '#0B5F54'], off: ['#ECEEEA', '#3D4750'], warn: ['#FDF3DC', '#6B4A00'], unknown: ['#ECEEEA', '#3D4750'] }[state];
  return <Pill bg={c[0]} fg={c[1]} className="font-bold">{children}</Pill>;
};

const Icon: React.FC<{ bg: string; children: React.ReactNode }> = ({ bg, children }) => (
  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]" style={{ background: bg }}>{children}</span>
);

export const IntegrationsPage: React.FC = () => {
  const { workspace, tasks, projects, me, mode, integrations, refreshIntegrations, canManage, setModal, notify } = useApp();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookService, setWebhookService] = useState<'slack' | 'discord'>('discord');
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookErr, setWebhookErr] = useState('');
  const server = mode === 'server';

  const load = useCallback(() => { if (server) api.tokens().then((r) => setTokens(r.tokens)).catch(() => undefined); }, [server]);
  useEffect(load, [load]);
  useEffect(() => { void refreshIntegrations(); }, [refreshIntegrations]);

  if (!workspace.enabledModules.integrations) {
    return <div className="px-4 py-6 sm:px-8"><Empty title="Modul Integrasi belum aktif" text="Aktifkan lewat Toko modul (tersedia di paket Bisnis)."><button type="button" className="btn btn-primary mt-2" onClick={() => setModal('modules')}>Buka Toko modul</button></Empty></div>;
  }

  const wa = integrations?.whatsapp;
  const payments = integrations?.payments;
  const ai = integrations?.ai;
  const list = tasks.filter((t) => t.dueDate && (scope === 'all' || t.assigneeId === me.id));

  const createToken = async (e: React.FormEvent) => {
    e.preventDefault();
    try { const r = await api.createToken(name.trim()); setFresh(r.token); setName(''); load(); } catch (ex) { notify('Gagal', errMsg(ex)); }
  };

  const testWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setWebhookBusy(true);
    setWebhookErr('');
    try {
      await api.sendWebhook({ webhookUrl: webhookUrl.trim(), service: webhookService, title: `Rampung · ${workspace.name}`, message: 'Pesan uji dari Rampung: webhook ini tersambung.' });
      notify('Pesan terkirim', `Periksa channel ${webhookService === 'slack' ? 'Slack' : 'Discord'} Anda.`, 'success');
    } catch (ex) {
      setWebhookErr(errMsg(ex));
    } finally {
      setWebhookBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-8">
      <PageHeader eyebrow="Modul Bisnis" title="Integrasi Layanan" />
      {!server && <div role="note" className="rounded-xl bg-kunyit-soft p-3 text-sm" style={{ color: '#6B4A00' }}>Integrasi hanya tersedia setelah masuk dengan akun.</div>}

      {/* WhatsApp */}
      <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 flex-[1_1_320px] items-start gap-3">
          <Icon bg="#E8F7EC"><MessageCircle size={20} color="#1A7F3C" /></Icon>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2"><h2 className="card-title">WhatsApp Business</h2>
              {!server ? <Status state="unknown">Perlu akun</Status> : !wa ? <Status state="unknown">Memeriksa…</Status> : !wa.configured ? <Status state="off">Belum dikonfigurasi</Status> : wa.reachable === false ? <Status state="warn">Tidak terjangkau</Status> : <Status state="on">Terhubung{wa.phoneNumber ? ` · ${wa.phoneNumber}` : ''}</Status>}
            </div>
            <span className="text-[13px] text-arang-muted">
              Kirim tagihan dan pengingat lewat WhatsApp Business Cloud API (Meta). {wa && !wa.configured ? 'Isi WHATSAPP_TOKEN dan WHATSAPP_PHONE_NUMBER_ID di backend untuk mengaktifkan.' : 'Pesan teks bebas hanya sampai ke penerima yang menghubungi nomor Anda dalam 24 jam terakhir; di luar itu Meta mewajibkan pesan template.'}
            </span>
          </div>
        </div>
        <button type="button" className="btn btn-outline" onClick={() => setModal('wa')}>Status &amp; kirim pesan uji</button>
      </section>

      {/* Pembayaran paket */}
      <section className="card flex flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <Icon bg="#FDF3DC"><QrCode size={20} color="#9A3F0B" /></Icon>
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2"><h2 className="card-title">Pembayaran paket (QRIS &amp; rekening)</h2>
              {!server ? <Status state="unknown">Perlu akun</Status> : !payments ? <Status state="unknown">Memeriksa…</Status> : payments.configured ? <Status state="on">Tujuan pembayaran diatur</Status> : <Status state="off">Belum diatur</Status>}
            </div>
            <span className="text-[13px] text-arang-muted">
              Paket Pro/Bisnis dibayar lewat QRIS atau transfer ke rekening yang diatur administrator sistem, lalu diverifikasi manual. Beli di Pengaturan → Kelola paket.
              Pembayaran invoice dari klien Anda dikonfirmasi manual di halaman <a href={href.keuangan}>Keuangan</a> setelah dana masuk.
              {payments && !payments.configured ? ' Administrator sistem belum mengisi QRIS/rekening, jadi paket berbayar belum bisa dibeli.' : ''}
            </span>
          </div>
        </div>
      </section>

      {/* AI */}
      <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 flex-[1_1_320px] items-start gap-3">
          <Icon bg="#E6EFFA"><Sparkles size={20} color="#1D5FA8" /></Icon>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2"><h2 className="card-title">Asisten AI</h2>
              {!server ? <Status state="unknown">Perlu akun</Status> : !ai ? <Status state="unknown">Memeriksa…</Status> : ai.configured ? <Status state="on">Model {ai.model}</Status> : <Status state="warn">Mode template (bukan AI)</Status>}
            </div>
            <span className="text-[13px] text-arang-muted">
              Memecah ide menjadi tugas. {ai && !ai.configured ? 'Tanpa ANTHROPIC_API_KEY di backend, pemecahan memakai template kata kunci dan ditandai demikian. Ringkasan proyek selalu dihitung dari data nyata proyek.' : 'Hasil dihasilkan model AI; periksa sebelum dipakai.'}
            </span>
          </div>
        </div>
        <button type="button" className="btn btn-outline" onClick={() => setModal('ai')}>Buka Asisten AI</button>
      </section>

      {/* Kalender ICS */}
      <section className="card flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <Icon bg="#E6EFFA"><CalendarDays size={20} color="#1D5FA8" /></Icon>
          <div className="flex flex-col gap-1">
            <h2 className="card-title">Kalender (Google Calendar, Outlook, Apple)</h2>
            <span className="text-[13px] text-arang-muted">Unduh berkas .ics berisi tenggat tugas, lalu impor ke kalender Anda (Google Calendar: Setelan &gt; Impor dan ekspor). Ini ekspor sekali jalan, bukan sinkronisasi langsung.</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex gap-1 rounded-[10px] bg-canvas-seg p-1 text-sm" role="group" aria-label="Cakupan ekspor">
            {([['mine', 'Tugas saya'], ['all', 'Semua tugas']] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)} className="h-9 cursor-pointer rounded-lg border-0 px-3.5" style={scope === k ? { background: '#fff', fontWeight: 700 } : { background: 'transparent' }}>{l}</button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" disabled={!list.length} onClick={() => { downloadFile(`rampung-${scope === 'mine' ? 'tugas-saya' : 'semua-tugas'}.ics`, buildIcs(list, projects, `Rampung · ${workspace.name}`), 'text/calendar;charset=utf-8'); notify('Kalender diunduh', `${list.length} tugas diekspor.`, 'success'); }}>Unduh .ics ({list.length})</button>
        </div>
      </section>

      {/* API Publik */}
      <section className="card flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="card-title">API Publik Rampung</h2>
          <span className="text-[13px] text-arang-muted">Buat token untuk mengakses data workspace dari skrip atau aplikasi lain. Token berhak penuh seperti akun Anda; simpan dengan aman.</span>
        </div>
        {!server ? (
          <span className="text-sm text-arang-muted">Token API hanya tersedia setelah masuk dengan akun.</span>
        ) : (
          <>
            <form onSubmit={createToken} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1"><Field label="Nama token" htmlFor="tk-name"><input id="tk-name" required className="input input-sm h-11" placeholder="Contoh: Skrip laporan otomatis" value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
              <button type="submit" className="btn btn-primary">Buat token</button>
            </form>
            {fresh && (
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-canvas p-3 text-sm">
                <span className="font-semibold">Salin sekarang. Token tidak akan ditampilkan lagi.</span>
                <code className="break-all rounded bg-white px-2 py-1 text-xs">{fresh}</code>
                <button type="button" className="btn btn-outline btn-sm self-start" onClick={() => { navigator.clipboard?.writeText(fresh); notify('Token disalin', undefined, 'success'); }}><Copy size={14} />Salin token</button>
              </div>
            )}
            {tokens.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3 text-sm">
                <span><strong>{t.name}</strong> <span className="text-arang-muted">· dibuat {fmtDateLong(t.created_at.slice(0, 10))}</span></span>
                <button type="button" aria-label={`Hapus token ${t.name}`} className="btn-icon" onClick={() => api.deleteToken(t.id).then(load).catch((ex) => notify('Gagal', errMsg(ex)))}><Trash2 size={15} /></button>
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-arang-muted">CONTOH PEMAKAIAN REST API</span>
              <code className="block overflow-x-auto whitespace-pre rounded-lg bg-arang p-3 text-xs" style={{ color: '#E4E8EA' }}>{`curl ${API_BASE}/sync \\\n  -H "Authorization: Bearer <token>"`}</code>
            </div>
          </>
        )}
      </section>

      {/* Webhook Slack / Discord */}
      <section className="card flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <Icon bg="#E6EFFA"><Webhook size={20} color="#1D5FA8" /></Icon>
          <div className="flex flex-col gap-1">
            <h2 className="card-title">Slack &amp; Discord</h2>
            <span className="text-[13px] text-arang-muted">Uji pengiriman pesan ke channel lewat Incoming Webhook. Hanya alamat webhook resmi Slack (hooks.slack.com) dan Discord (discord.com/api/webhooks) yang diterima. Pengiriman otomatis saat tugas selesai belum tersedia.</span>
          </div>
        </div>
        {!server ? <span className="text-sm text-arang-muted">Tersedia setelah masuk dengan akun.</span> : !canManage ? <span className="text-sm text-arang-muted">Hanya pemilik atau admin yang dapat mengirim webhook.</span> : (
          <form onSubmit={testWebhook} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40"><Field label="Layanan" htmlFor="wh-srv"><select id="wh-srv" className="input input-sm h-11" value={webhookService} onChange={(e) => setWebhookService(e.target.value as 'slack' | 'discord')}><option value="discord">Discord</option><option value="slack">Slack</option></select></Field></div>
              <div className="min-w-[280px] flex-1"><Field label="Incoming Webhook URL" htmlFor="wh-url"><input id="wh-url" required type="url" className="input input-sm h-11 font-mono text-xs" placeholder={webhookService === 'discord' ? 'https://discord.com/api/webhooks/...' : 'https://hooks.slack.com/services/...'} value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} /></Field></div>
              <button type="submit" disabled={webhookBusy || !webhookUrl.trim()} className="btn btn-primary h-11"><Send size={15} />{webhookBusy ? 'Mengirim...' : 'Kirim pesan uji'}</button>
            </div>
            {webhookErr && <span role="alert" className="text-sm font-semibold" style={{ color: '#B42318' }}>{webhookErr}</span>}
          </form>
        )}
      </section>
    </div>
  );
};
