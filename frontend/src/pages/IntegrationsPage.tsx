import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Copy, MessageCircle, QrCode, Sparkles, Trash2, CheckCircle2, Webhook, Send } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { Empty, Field, PageHeader, Pill } from '../components/ui';
import { API_BASE, ApiError, api, QrisGenerateResult } from '../lib/api';
import type { ApiToken } from '../lib/api';
import { buildIcs, downloadFile } from '../lib/ics';
import { fmtDateLong, rupiah } from '../lib/format';

export const IntegrationsPage: React.FC = () => {
  const { workspace, tasks, projects, me, mode, setModal, notify } = useApp();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const server = mode === 'server';

  // State untuk pengujian QRIS
  const [qrisAmount, setQrisAmount] = useState<number>(250000);
  const [qrisData, setQrisData] = useState<QrisGenerateResult | null>(null);
  const [qrisLoading, setQrisLoading] = useState(false);
  const [qrisPaid, setQrisPaid] = useState(false);

  // State untuk Webhook Slack / Discord
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookService, setWebhookService] = useState<'slack' | 'discord'>('discord');
  const [webhookTesting, setWebhookTesting] = useState(false);

  const handleTestWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.trim()) return;
    setWebhookTesting(true);
    try {
      await api.sendWebhook({
        webhookUrl: webhookUrl.trim(),
        service: webhookService,
        title: `Notifikasi Rampung · ${workspace.name}`,
        message: `Halo! Integrasi webhook ${webhookService.toUpperCase()} aktif. Notifikasi perubahan tugas dan pembayaran invoice akan dikirim ke channel ini.`,
      });
      notify('Webhook Terkirim!', `Pesan berhasil dikirim ke channel ${webhookService.toUpperCase()}.`, 'success');
    } catch (err: any) {
      notify('Gagal kirim webhook', err?.message || 'Pastikan URL webhook valid.');
    } finally {
      setWebhookTesting(false);
    }
  };

  const load = useCallback(() => { if (server) api.tokens().then((r) => setTokens(r.tokens)).catch(() => undefined); }, [server]);
  useEffect(load, [load]);

  if (!workspace.enabledModules.integrations) {
    return <div className="px-4 py-6 sm:px-8"><Empty title="Modul Integrasi belum aktif" text="Aktifkan lewat Toko modul (tersedia di paket Bisnis)."><button type="button" className="btn btn-primary mt-2" onClick={() => setModal('modules')}>Buka Toko modul</button></Empty></div>;
  }

  const list = tasks.filter((t) => t.dueDate && (scope === 'all' || t.assigneeId === me.id));
  const fail = (e: unknown) => notify('Gagal', e instanceof ApiError ? e.message : 'Terjadi kesalahan.');
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try { const r = await api.createToken(name.trim()); setFresh(r.token); setName(''); load(); } catch (ex) { fail(ex); }
  };

  const handleGenerateQris = async () => {
    setQrisLoading(true);
    setQrisPaid(false);
    try {
      const res = await api.generateQris({ amount: qrisAmount, customerName: me.name });
      setQrisData(res);
      notify('QRIS dibuat', `Nominal ${rupiah(qrisAmount)} siap dibayar.`, 'success');
    } catch (e: any) {
      notify('Gagal membuat QRIS', e?.message || 'Pastikan backend berjalan.');
    } finally {
      setQrisLoading(false);
    }
  };

  const handleVerifyQris = async () => {
    if (!qrisData) return;
    try {
      await api.verifyQris({ invoiceId: qrisData.transactionId });
      setQrisPaid(true);
      notify('Pembayaran Diterima!', 'QRIS terverifikasi lunas oleh sistem perbankan.', 'success');
    } catch (e: any) {
      notify('Gagal verifikasi QRIS', e?.message || 'Gagal memverifikasi');
    }
  };

  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-8">
      <PageHeader eyebrow="Modul Bisnis" title="Integrasi Layanan" />

      {/* WhatsApp Gateway */}
      <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 flex-[1_1_320px] items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#E8F7EC]">
            <MessageCircle size={20} color="#1A7F3C" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="card-title">WhatsApp Business Gateway</h2>
            <span className="text-[13px] text-arang-muted">
              Pengiriman pengingat tugas otomatis, notifikasi mention tim, dan invoice penagihan ke WhatsApp.
              {workspace.whatsappConnected ? ` Terhubung ke nomor ${workspace.whatsappNumber}.` : ' Belum terhubung.'}
            </span>
          </div>
        </div>
        <button type="button" className="btn btn-outline" onClick={() => setModal('wa')}>
          {workspace.whatsappConnected ? 'Kelola & Uji Coba' : 'Hubungkan'}
        </button>
      </section>

      {/* QRIS Gateway */}
      <section className="card flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-kunyit-soft">
              <QrCode size={20} color="#9A3F0B" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="card-title">Pembayaran QRIS Standar Nasional</h2>
              <span className="text-[13px] text-arang-muted">
                Generate kode QRIS dinamis untuk pembayaran invoice otomatis dari e-wallet (GoPay, OVO, ShopeePay, BCA, dll).
              </span>
            </div>
          </div>
          <Pill bg="#E3F3F0" fg="#0B5F54" className="font-bold">Aktif di Node.js API</Pill>
        </div>

        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="w-48">
            <Field label="Nominal Uji Coba" htmlFor="qris-amt">
              <input
                id="qris-amt"
                type="number"
                min={10000}
                step={10000}
                className="input input-sm h-11"
                value={qrisAmount}
                onChange={(e) => setQrisAmount(Number(e.target.value))}
              />
            </Field>
          </div>
          <button
            type="button"
            className="btn btn-kunyit"
            disabled={qrisLoading || qrisAmount <= 0}
            onClick={handleGenerateQris}
          >
            {qrisLoading ? 'Memproses...' : 'Buat Kode QRIS'}
          </button>
        </div>

        {qrisData && (
          <div className="flex flex-wrap items-center gap-6 rounded-xl border border-line bg-canvas p-4 mt-2">
            <div className="flex flex-col items-center gap-2 bg-white p-3 rounded-lg border border-line-soft">
              <img src={qrisData.qrImageUrl} alt="QRIS Code" className="w-40 h-40 object-contain" />
              <span className="text-[11px] font-bold text-arang-muted tracking-wider">QRIS INTERACTIVE</span>
            </div>
            <div className="flex flex-col gap-2 text-sm flex-1">
              <span className="font-bold text-base text-arang">{rupiah(qrisData.amount)}</span>
              <span className="text-xs text-arang-muted">ID Transaksi: <code>{qrisData.transactionId}</code></span>
              <span className="text-xs text-arang-muted">Berlaku sampai: {new Date(qrisData.expiresAt).toLocaleTimeString('id-ID')}</span>
              
              <div className="pt-2">
                {qrisPaid ? (
                  <div className="flex items-center gap-2 text-primary font-bold text-sm bg-primary/10 px-3 py-2 rounded-lg">
                    <CheckCircle2 size={18} />
                    Pembayaran Lunas Diverifikasi!
                  </div>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleVerifyQris}>
                    Simulasikan Pembayaran Klien (Lunas)
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Asisten AI */}
      <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 flex-[1_1_320px] items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-biru-soft">
            <Sparkles size={20} color="#1D5FA8" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="card-title">Asisten AI Proyek</h2>
            <span className="text-[13px] text-arang-muted">
              Pecah ide atau brief proyek menjadi daftar tugas terstruktur, estimasi jam kerja, dan ringkasan risiko proyek.
            </span>
          </div>
        </div>
        <button type="button" className="btn btn-outline" onClick={() => setModal('ai')}>
          Buka Asisten AI
        </button>
      </section>

      {/* Kalender ICS */}
      <section className="card flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-biru-soft">
            <CalendarDays size={20} color="#1D5FA8" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="card-title">Kalender (Google Calendar, Outlook, Apple)</h2>
            <span className="text-[13px] text-arang-muted">
              Unduh berkas .ics berisi tenggat tugas, lalu impor ke kalender Anda (Google Calendar: Setelan &gt; Impor dan ekspor).
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex gap-1 rounded-[10px] bg-canvas-seg p-1 text-sm" role="group" aria-label="Cakupan ekspor">
            {([['mine', 'Tugas saya'], ['all', 'Semua tugas']] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={scope === k}
                onClick={() => setScope(k)}
                className="h-9 cursor-pointer rounded-lg border-0 px-3.5"
                style={scope === k ? { background: '#fff', fontWeight: 700 } : { background: 'transparent' }}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!list.length}
            onClick={() => {
              downloadFile(`rampung-${scope === 'mine' ? 'tugas-saya' : 'semua-tugas'}.ics`, buildIcs(list, projects, `Rampung · ${workspace.name}`), 'text/calendar;charset=utf-8');
              notify('Kalender diunduh', `${list.length} tugas diekspor.`, 'success');
            }}
          >
            Unduh .ics ({list.length})
          </button>
        </div>
      </section>

      {/* API Publik */}
      <section className="card flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="card-title">API Publik Rampung</h2>
          <span className="text-[13px] text-arang-muted">
            Buat token untuk mengakses data workspace dari skrip, integrasi CI/CD, atau aplikasi eksternal.
          </span>
        </div>
        {!server ? (
          <span className="text-sm text-arang-muted">Token API hanya tersedia setelah masuk dengan akun (bukan mode lokal).</span>
        ) : (
          <>
            <form onSubmit={create} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <Field label="Nama token" htmlFor="tk-name">
                  <input
                    id="tk-name"
                    required
                    className="input input-sm h-11"
                    placeholder="Contoh: Skrip laporan otomatis"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
              </div>
              <button type="submit" className="btn btn-primary">Buat token</button>
            </form>
            {fresh && (
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-canvas p-3 text-sm">
                <span className="font-semibold">Salin sekarang. Token tidak akan ditampilkan lagi.</span>
                <code className="break-all rounded bg-white px-2 py-1 text-xs">{fresh}</code>
                <button
                  type="button"
                  className="btn btn-outline btn-sm self-start"
                  onClick={() => { navigator.clipboard?.writeText(fresh); notify('Token disalin', undefined, 'success'); }}
                >
                  <Copy size={14} />Salin token
                </button>
              </div>
            )}
            {tokens.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3 text-sm">
                <span>
                  <strong>{t.name}</strong> <span className="text-arang-muted">· dibuat {fmtDateLong(t.created_at.slice(0, 10))}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Hapus token ${t.name}`}
                  className="btn-icon"
                  onClick={() => api.deleteToken(t.id).then(load).catch(fail)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-arang-muted">CONTOH PEMAKAIAN REST API</span>
              <code className="block overflow-x-auto whitespace-pre rounded-lg bg-arang p-3 text-xs" style={{ color: '#E4E8EA' }}>
                {`curl ${API_BASE}/sync \\\n  -H "Authorization: Bearer <token>"`}
              </code>
            </div>
          </>
        )}
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-biru-soft">
              <Webhook size={20} color="#1D5FA8" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="card-title">Slack & Discord Webhooks</h2>
              <span className="text-[13px] text-arang-muted">
                Kirim pesan notifikasi otomatis saat tugas selesai atau invoice dibayar ke channel Slack atau server Discord tim.
              </span>
            </div>
          </div>
          <Pill bg="#E3F3F0" fg="#0B5F54" className="font-bold">Aktif</Pill>
        </div>

        <form onSubmit={handleTestWebhook} className="flex flex-col gap-3 pt-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Field label="Layanan" htmlFor="wh-srv">
                <select
                  id="wh-srv"
                  className="input input-sm h-11"
                  value={webhookService}
                  onChange={(e) => setWebhookService(e.target.value as 'slack' | 'discord')}
                >
                  <option value="discord">Discord Webhook</option>
                  <option value="slack">Slack Webhook</option>
                </select>
              </Field>
            </div>
            <div className="min-w-[280px] flex-1">
              <Field label="Incoming Webhook URL" htmlFor="wh-url">
                <input
                  id="wh-url"
                  required
                  type="url"
                  className="input input-sm h-11 font-mono text-xs"
                  placeholder={webhookService === 'discord' ? 'https://discord.com/api/webhooks/...' : 'https://hooks.slack.com/services/...'}
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
              </Field>
            </div>
            <button
              type="submit"
              disabled={webhookTesting || !webhookUrl.trim()}
              className="btn btn-primary h-11"
            >
              <Send size={15} />
              {webhookTesting ? 'Mengirim...' : 'Uji Coba Kirim'}
            </button>
          </div>
          <span className="text-xs text-arang-muted">
            URL webhook akan dipanggil oleh server backend Node.js untuk mengirim embed interaktif ke channel tim.
          </span>
        </form>
      </section>
    </div>
  );
};
