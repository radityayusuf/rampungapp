import React, { useState } from 'react';
import { Building2, Download, Pencil, Plus, Printer, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store/AppContext';
import { InvoicePayment } from '../components/InvoicePayment';
import type { CompanyProfile, Expense, Invoice } from '../types';
import { Empty, Field, Modal, PageHeader, Pill, Progress, Stat } from '../components/ui';
import { addDays, diffDays, errMsg, exportCsv, fmtDate, fmtDateLong, pct, relDay, rupiah, rupiahJt, todayISO } from '../lib/format';
import { InvoiceLabel, invoiceStatus, invoiceSubtotal, invoiceTax, invoiceTotal, nextInvoiceNumber, toItems } from '../lib/invoice';

const shell = 'flex flex-col gap-5 px-4 py-6 sm:px-8';
const TONE: Record<InvoiceLabel, [string, string]> = { Lunas: ['#E3F3F0', '#0B5F54'], 'Lewat tempo': ['#FDECEA', '#B42318'], Menunggu: ['#FDF3DC', '#6B4A00'], Dibatalkan: ['#ECEEEA', '#3D4750'] };
const CATEGORIES: Expense['category'][] = ['operasional', 'vendor', 'software', 'transport', 'lainnya'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------------- Formulir invoice (baru & ubah) ---------------- */
type Row = { description: string; qty: string; price: string };
const emptyRow = (): Row => ({ description: '', qty: '1', price: '' });

const InvoiceDialog: React.FC<{ invoice?: Invoice; onClose: () => void; onSaved: (id: string) => void }> = ({ invoice, onClose, onSaved }) => {
  const { clients, projects, invoices, workspace, createInvoice, updateInvoice } = useApp();
  const prefix = workspace.company?.prefix;
  const [f, setF] = useState(() => ({
    clientId: invoice?.clientId ?? '',
    projectId: invoice?.projectId ?? '',
    issueDate: invoice?.issueDate ?? todayISO(),
    dueDate: invoice?.dueDate ?? relDay(14),
    number: invoice?.number ?? nextInvoiceNumber(invoices, todayISO(), prefix),
    taxRate: invoice?.taxRate ? String(invoice.taxRate) : '',
    note: invoice ? invoice.note ?? '' : workspace.company?.note ?? '',
  }));
  const [customNumber, setCustomNumber] = useState(!!invoice);
  const [rows, setRows] = useState<Row[]>(() => (invoice ? invoice.items.map((x) => ({ description: x.description, qty: String(x.qty ?? 1), price: String(x.price ?? x.amount) })) : [emptyRow()]));
  const setRow = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const items = toItems(rows);
  // Baris yang sudah diisi sebagian tidak boleh hilang diam-diam saat disimpan.
  const partial = rows.some((r) => (r.description.trim() || r.price) && !toItems([r]).length);
  const taxRate = Math.min(100, Math.max(0, Number(f.taxRate) || 0));
  const totals = { items, taxRate };
  const duplicate = invoices.some((x) => x.id !== invoice?.id && x.number.toLowerCase() === f.number.trim().toLowerCase());
  const problem = !f.clientId ? 'Pilih klien.' : !f.number.trim() ? 'Isi nomor invoice.' : duplicate ? 'Nomor invoice sudah dipakai.' : !f.issueDate || !f.dueDate ? 'Isi tanggal.' : f.dueDate < f.issueDate ? 'Jatuh tempo tidak boleh sebelum tanggal terbit.' : partial ? 'Lengkapi uraian, jumlah, dan harga setiap baris.' : !items.length ? 'Isi minimal satu baris.' : '';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (problem) return;
    const body = { clientId: f.clientId, projectId: f.projectId || undefined, number: f.number.trim(), issueDate: f.issueDate, dueDate: f.dueDate, items, taxRate: taxRate || undefined, note: f.note.trim() || undefined };
    if (invoice) {
      if (updateInvoice(invoice.id, body)) onSaved(invoice.id);
    } else {
      const n = createInvoice(body);
      if (n) onSaved(n.id);
    }
  };

  const setIssue = (issueDate: string) => setF({ ...f, issueDate, ...(issueDate ? { dueDate: addDays(issueDate, diffDays(f.issueDate || issueDate, f.dueDate)) } : {}), ...(!customNumber && issueDate ? { number: nextInvoiceNumber(invoices, issueDate, prefix) } : {}) });

  return (
    <Modal open wide onClose={onClose} title={invoice ? `Ubah invoice ${invoice.number}` : 'Buat invoice'} footer={<><span role="status" className="mr-auto self-center text-[13px] text-arang-muted">{problem}</span><button type="button" className="btn btn-outline" onClick={onClose}>Batal</button><button type="submit" form="form-invoice" className="btn btn-primary" disabled={!!problem}>{invoice ? 'Simpan perubahan' : 'Terbitkan'}</button></>}>
      <form id="form-invoice" onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Klien" htmlFor="ic" hint={clients.length ? undefined : 'Belum ada klien. Tambahkan dulu di CRM Klien.'}><select id="ic" className="input" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}><option value="">Pilih klien...</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</select></Field>
          <Field label="Proyek (opsional)" htmlFor="ip"><select id="ip" className="input" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">–</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</select></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nomor invoice" htmlFor="in"><input id="in" className="input" value={f.number} onChange={(e) => { setCustomNumber(true); setF({ ...f, number: e.target.value }); }} /></Field>
          <Field label="Tanggal terbit" htmlFor="ii"><input id="ii" type="date" className="input" value={f.issueDate} onChange={(e) => setIssue(e.target.value)} /></Field>
          <Field label="Jatuh tempo" htmlFor="idue"><input id="idue" type="date" className="input" min={f.issueDate} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        </div>

        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="field-label mb-2 p-0">Rincian</legend>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-line-soft p-3 sm:grid-cols-[1fr_72px_150px_130px_36px] sm:items-center sm:border-0 sm:p-0">
              <input aria-label={`Uraian baris ${i + 1}`} className="input col-span-2 sm:col-span-1" placeholder="Contoh: Termin 2 (50%) website" value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} />
              <input aria-label={`Jumlah baris ${i + 1}`} type="number" min={0} step="any" className="input" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} />
              <input aria-label={`Harga satuan baris ${i + 1}`} type="number" min={0} className="input" placeholder="Harga (Rp)" value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} />
              <span className="tabular self-center text-sm font-bold sm:text-right">{rupiah((Number(r.qty) || 0) * (Number(r.price) || 0))}</span>
              <button type="button" aria-label={`Hapus baris ${i + 1}`} disabled={rows.length === 1} className="btn-icon justify-self-end border-0 disabled:opacity-30" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X size={16} /></button>
            </div>
          ))}
          <button type="button" className="btn btn-outline btn-sm self-start" onClick={() => setRows([...rows, emptyRow()])}><Plus size={14} />Tambah baris</button>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
          <Field label="Catatan (opsional)" htmlFor="inote"><textarea id="inote" className="input min-h-[84px]" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <div className="flex flex-col gap-2 rounded-xl bg-canvas p-4 text-sm">
            <div className="flex justify-between"><span className="text-arang-muted">Subtotal</span><span className="tabular font-semibold">{rupiah(invoiceSubtotal(totals))}</span></div>
            <div className="flex items-center justify-between gap-2"><label htmlFor="itax" className="text-arang-muted">PPN (%)</label><input id="itax" type="number" min={0} max={100} step="any" placeholder="0" className="input input-sm w-20 text-right" value={f.taxRate} onChange={(e) => setF({ ...f, taxRate: e.target.value })} /></div>
            {taxRate > 0 && <div className="flex justify-between"><span className="text-arang-muted">Nilai PPN</span><span className="tabular font-semibold">{rupiah(invoiceTax(totals))}</span></div>}
            <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-extrabold"><span>Total</span><span className="tabular">{rupiah(invoiceTotal(totals))}</span></div>
          </div>
        </div>
      </form>
    </Modal>
  );
};

/* ---------------- Profil perusahaan ---------------- */
const CompanyDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { workspace, updateWorkspace, notify } = useApp();
  const [f, setF] = useState<CompanyProfile>(() => ({ name: workspace.name, address: '', email: '', phone: '', npwp: '', bankName: '', bankNumber: '', bankHolder: '', prefix: 'INV', note: '', ...workspace.company }));
  const bind = (k: keyof CompanyProfile) => ({ id: `cp-${k}`, className: 'input', value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }) });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    const company = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])) as unknown as CompanyProfile;
    updateWorkspace({ company: { ...company, prefix: company.prefix || 'INV' } });
    notify('Profil perusahaan disimpan', 'Tampil di semua invoice.', 'success');
    onClose();
  };
  return (
    <Modal open wide onClose={onClose} title="Profil perusahaan di invoice" footer={<><button type="button" className="btn btn-outline" onClick={onClose}>Batal</button><button type="submit" form="form-company" className="btn btn-primary" disabled={!f.name.trim()}>Simpan</button></>}>
      <form id="form-company" onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nama perusahaan / usaha" htmlFor="cp-name"><input {...bind('name')} /></Field>
          <Field label="NPWP (opsional)" htmlFor="cp-npwp"><input {...bind('npwp')} /></Field>
          <Field label="Email" htmlFor="cp-email"><input type="email" {...bind('email')} /></Field>
          <Field label="Telepon" htmlFor="cp-phone"><input inputMode="tel" {...bind('phone')} /></Field>
        </div>
        <Field label="Alamat" htmlFor="cp-address"><input {...bind('address')} /></Field>
        <h3 className="m-0 mt-1 text-sm font-bold">Rekening pembayaran</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Bank" htmlFor="cp-bankName"><input placeholder="BCA" {...bind('bankName')} /></Field>
          <Field label="Nomor rekening" htmlFor="cp-bankNumber"><input inputMode="numeric" {...bind('bankNumber')} /></Field>
          <Field label="Atas nama" htmlFor="cp-bankHolder"><input {...bind('bankHolder')} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <Field label="Awalan nomor" htmlFor="cp-prefix" hint={`Contoh: ${f.prefix.trim() || 'INV'}-${todayISO().slice(0, 4)}-001`}><input {...bind('prefix')} /></Field>
          <Field label="Catatan bawaan (opsional)" htmlFor="cp-note"><input placeholder="Mohon cantumkan nomor invoice saat transfer." {...bind('note')} /></Field>
        </div>
      </form>
    </Modal>
  );
};

/* ---------------- Formulir pengeluaran ---------------- */
const ExpenseDialog: React.FC<{ expense?: Expense; onClose: () => void }> = ({ expense, onClose }) => {
  const { projects, addExpense, updateExpense } = useApp();
  const [f, setF] = useState(() => ({ projectId: expense?.projectId ?? '', title: expense?.title ?? '', amount: expense ? String(expense.amount) : '', category: expense?.category ?? ('operasional' as Expense['category']), date: expense?.date ?? todayISO() }));
  const gone = !!f.projectId && !projects.some((p) => p.id === f.projectId);
  const ready = !!f.projectId && !!f.title.trim() && Number(f.amount) > 0 && !!f.date;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    const body = { projectId: f.projectId, title: f.title.trim(), amount: Math.round(Number(f.amount)), category: f.category, date: f.date };
    if (expense) updateExpense(expense.id, body);
    else addExpense(body);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={expense ? 'Ubah pengeluaran' : 'Catat pengeluaran'} footer={<><button type="button" className="btn btn-outline" onClick={onClose}>Batal</button><button type="submit" form="form-expense" className="btn btn-primary" disabled={!ready}>Simpan</button></>}>
      <form id="form-expense" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Proyek" htmlFor="ep"><select id="ep" className="input" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">Pilih proyek...</option>{gone && <option value={f.projectId}>Proyek dihapus</option>}{projects.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</select></Field>
        <Field label="Keterangan" htmlFor="et"><input id="et" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Jumlah (Rp)" htmlFor="eam"><input id="eam" type="number" min={0} className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Kategori" htmlFor="ek"><select id="ek" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Expense['category'] })}>{CATEGORIES.map((c) => <option key={c} value={c}>{cap(c)}</option>)}</select></Field>
          <Field label="Tanggal" htmlFor="ed"><input id="ed" type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        </div>
      </form>
    </Modal>
  );
};

/* ---------------- Pratinjau & cetak ---------------- */
const InvoicePreview: React.FC<{ invoice: Invoice; onEdit: () => void; onCompany: () => void }> = ({ invoice: inv, onEdit, onCompany }) => {
  const { workspace, clients, notify, integrations, setInvoiceStatus } = useApp();
  const [sending, setSending] = useState(false);
  const c = clients.find((x) => x.id === inv.clientId);
  const to = inv.billTo ?? (c ? { company: c.company, contact: c.contact } : { company: 'Klien dihapus', contact: '' });
  const co = workspace.company;
  const label = invoiceStatus(inv);
  const total = invoiceTotal(inv);
  const contactLine = [co?.email, co?.phone].filter(Boolean).join(' · ');

  const sendWa = async () => {
    if (!c?.phone) return notify('Nomor telepon tidak ada', 'Klien belum memiliki nomor telepon WhatsApp.');
    setSending(true);
    try {
      await api.sendWhatsApp({ phone: c.phone, message: `Halo ${to.contact || to.company}, tagihan invoice ${inv.number} sebesar ${rupiah(total)} telah diterbitkan dengan jatuh tempo ${fmtDateLong(inv.dueDate)}. Silakan lakukan pembayaran atau hubungi kami bila ada pertanyaan. Terima kasih!` });
      notify('Diterima WhatsApp', `Pesan untuk ${to.contact || to.company} (${c.phone}) dikirim.`, 'wa');
    } catch (err) {
      notify('Gagal kirim WhatsApp', errMsg(err, 'Gateway WhatsApp tidak merespons.'));
    } finally {
      setSending(false);
    }
  };
  const voidIt = () => { if (window.confirm(`Batalkan invoice ${inv.number}?\n\nInvoice tetap tersimpan sebagai arsip dengan status Dibatalkan, dan tidak lagi dihitung sebagai tagihan.`)) setInvoiceStatus(inv.id, 'void'); };
  const unpay = () => { if (window.confirm(`Kembalikan ${inv.number} menjadi BELUM dibayar?\n\nGunakan bila invoice ini salah ditandai lunas.`)) setInvoiceStatus(inv.id, 'unpaid'); };

  return (
    <div className="flex min-w-0 flex-[2_1_380px] flex-col gap-3">
      {!co?.bankNumber && (
        <div role="note" className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl bg-kunyit-soft p-3.5 text-[13px]" style={{ color: '#6B4A00' }}>
          <span>Lengkapi nama perusahaan dan rekening agar klien tahu harus membayar ke mana.</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={onCompany}>Isi sekarang</button>
        </div>
      )}
      <section aria-label="Pratinjau invoice" className="card print-area flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: '#0F9D8A' }}>
          <div className="flex min-w-0 flex-col gap-0.5 text-[13px] leading-relaxed">
            <span className="text-[17px] font-extrabold text-arang">{co?.name || workspace.name}</span>
            {co?.address && <span className="text-arang-body">{co.address}</span>}
            {contactLine && <span className="text-arang-body">{contactLine}</span>}
            {co?.npwp && <span className="text-arang-body">NPWP {co.npwp}</span>}
          </div>
          <div className="flex flex-col items-end gap-1.5 text-right"><span className="text-xs font-bold tracking-[0.6px] text-arang-muted">INVOICE</span><span className="text-lg font-extrabold leading-none">{inv.number}</span><Pill bg={TONE[label][0]} fg={TONE[label][1]} className={`font-bold ${inv.status === 'unpaid' ? 'no-print' : ''}`}>{label}</Pill></div>
        </div>
        <div className="flex flex-wrap justify-between gap-4 text-[13px] leading-relaxed">
          <div className="flex flex-col"><span className="text-arang-muted">Kepada</span><span className="font-bold">{to.company}</span>{to.contact && to.contact !== '-' && <span>u.p. {to.contact}</span>}</div>
          <div className="flex flex-col"><span className="text-arang-muted">Tanggal terbit</span><span className="font-bold">{fmtDateLong(inv.issueDate)}</span></div>
          <div className="flex flex-col text-right"><span className="text-arang-muted">Jatuh tempo</span><span className="font-bold">{fmtDateLong(inv.dueDate)}</span></div>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead><tr className="text-left text-xs text-arang-muted"><th className="pb-2 font-semibold">Uraian</th><th className="pb-2 text-right font-semibold">Jumlah</th><th className="hidden pb-2 text-right font-semibold sm:table-cell print:table-cell">Harga</th><th className="pb-2 text-right font-semibold">Total</th></tr></thead>
          <tbody>{inv.items.map((x, i) => <tr key={i} className="border-t border-line-soft align-top"><td className="py-2.5 pr-3">{x.description}</td><td className="tabular py-2.5 text-right">{(x.qty ?? 1).toLocaleString('id-ID')}</td><td className="tabular hidden whitespace-nowrap py-2.5 pl-3 text-right sm:table-cell print:table-cell">{rupiah(x.price ?? x.amount)}</td><td className="tabular whitespace-nowrap py-2.5 pl-3 text-right font-bold">{rupiah(x.amount)}</td></tr>)}</tbody>
        </table>
        <div className="flex flex-col gap-1.5 self-end text-sm" style={{ minWidth: 220 }}>
          {!!inv.taxRate && <><div className="flex justify-between gap-6"><span className="text-arang-muted">Subtotal</span><span className="tabular">{rupiah(invoiceSubtotal(inv))}</span></div><div className="flex justify-between gap-6"><span className="text-arang-muted">PPN {String(inv.taxRate).replace('.', ',')}%</span><span className="tabular">{rupiah(invoiceTax(inv))}</span></div></>}
          <div className="flex justify-between gap-6 border-t border-line pt-2 text-lg font-extrabold"><span>Total</span><span className="tabular">{rupiah(total)}</span></div>
        </div>
        {co?.bankNumber && inv.status !== 'void' && <div className="flex flex-col gap-0.5 rounded-xl bg-canvas p-3.5 text-[13px]"><span className="text-arang-muted">Pembayaran ke</span><span className="font-bold">{co.bankName} {co.bankNumber}</span>{co.bankHolder && <span>a.n. {co.bankHolder}</span>}</div>}
        {inv.note && <p className="m-0 whitespace-pre-line text-[13px] text-arang-body">{inv.note}</p>}
      </section>

      <div className="no-print card flex flex-col gap-3 p-4">
        {inv.status === 'void'
          ? <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-arang-body"><span>Dibatalkan{inv.voidAt ? ` pada ${fmtDate(inv.voidAt.slice(0, 10))}` : ''}. Tidak dihitung sebagai tagihan.</span><button type="button" className="btn btn-outline btn-sm" onClick={() => setInvoiceStatus(inv.id, 'unpaid')}><RotateCcw size={14} />Aktifkan lagi</button></div>
          : <InvoicePayment invoice={inv} total={total} />}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={() => window.print()}><Printer size={15} />Cetak / simpan PDF</button>
          {inv.status === 'unpaid' && <button type="button" className="btn btn-outline" onClick={onEdit}><Pencil size={14} />Ubah</button>}
          {inv.status === 'unpaid' && integrations?.whatsapp.configured && <button type="button" disabled={sending} className="btn btn-outline" onClick={sendWa}><Send size={15} />{sending ? 'Mengirim...' : 'Kirim via WhatsApp'}</button>}
          {inv.status === 'unpaid' && <button type="button" className="btn btn-outline text-danger" onClick={voidIt}>Batalkan invoice</button>}
          {inv.status === 'paid' && <button type="button" className="btn btn-outline" onClick={unpay}><RotateCcw size={14} />Batal tandai lunas</button>}
        </div>
      </div>
    </div>
  );
};

/* ---------------- Halaman ---------------- */
export const FinancePage: React.FC = () => {
  const { workspace, invoices, clients, projects, expenses, deleteExpense, setModal, canManage } = useApp();
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<{ invoice?: Invoice } | null>(null);
  const [exp, setExp] = useState<{ expense?: Expense } | null>(null);
  const [company, setCompany] = useState(false);
  const [allExp, setAllExp] = useState(false);
  if (!workspace.enabledModules.finance) return <div className={shell}><Empty title="Modul Keuangan belum aktif" text="Aktifkan lewat Toko modul. Modul bisnis hanya muncul saat dibutuhkan."><button type="button" className="btn btn-primary mt-2" onClick={() => setModal('modules')}>Buka Toko modul</button></Empty></div>;
  if (!canManage) return <div className={shell}><Empty title="Akses terbatas" text="Modul ini hanya untuk pemilik dan admin workspace." /></div>;

  const nameOf = (i: Invoice) => i.billTo?.company ?? clients.find((c) => c.id === i.clientId)?.company ?? 'Klien dihapus';
  const sum = (list: Invoice[]) => list.reduce((s, i) => s + invoiceTotal(i), 0);
  const unpaid = invoices.filter((i) => i.status === 'unpaid');
  const late = unpaid.filter((i) => invoiceStatus(i) === 'Lewat tempo');
  const paid30 = invoices.filter((i) => i.status === 'paid' && i.paidAt && diffDays(i.paidAt.slice(0, 10), todayISO()) <= 30);
  const bProjects = projects.filter((p) => p.budget > 0);
  const budget = bProjects.reduce((s, p) => s + p.budget, 0);
  const spent = bProjects.reduce((s, p) => s + p.spent, 0);
  const preview = invoices.find((i) => i.id === sel) ?? invoices[0];
  const sortedExp = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
  const projectOf = (id: string) => projects.find((p) => p.id === id)?.shortName ?? 'Proyek dihapus';
  const saved = (id: string) => { setSel(id); setForm(null); };

  const downloadCsv = () => exportCsv('daftar-invoice.csv', [
    ['Nomor', 'Klien', 'Tanggal terbit', 'Jatuh tempo', 'Subtotal (Rp)', 'PPN (Rp)', 'Total (Rp)', 'Status'],
    ...invoices.map((i) => [i.number, nameOf(i), i.issueDate, i.dueDate, invoiceSubtotal(i), invoiceTax(i), invoiceTotal(i), invoiceStatus(i)]),
  ]);

  return (
    <div className={shell}>
      <PageHeader eyebrow="Modul Bisnis" title="Keuangan Proyek">
        <button type="button" className="btn btn-outline" onClick={() => setCompany(true)}><Building2 size={15} />Profil perusahaan</button>
        <button type="button" className="btn btn-outline" onClick={downloadCsv}><Download size={15} />Unduh CSV</button>
        <button type="button" className="btn btn-outline" onClick={() => setExp({})}><Plus size={15} />Catat pengeluaran</button>
        <button type="button" className="btn btn-primary" onClick={() => setForm({})}><Plus size={16} />Buat invoice</button>
      </PageHeader>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <Stat label="Belum dibayar" value={rupiahJt(sum(unpaid))} note={`${unpaid.length} invoice`} />
        <Stat label="Lewat jatuh tempo" value={rupiahJt(sum(late))} tone={late.length ? '#B42318' : undefined} note={late.length ? late.map(nameOf).join(', ') : 'Tidak ada'} />
        <Stat label="Diterima 30 hari" value={rupiahJt(sum(paid30))} tone="#0B7A6B" note={`${paid30.length} invoice lunas`} />
        <Stat label="Anggaran terpakai" value={`${pct(spent, budget)}%`} note={`${rupiahJt(spent)} dari ${rupiahJt(budget)}`} />
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
          <section className="card overflow-x-auto"><div className="border-b border-line-soft px-5 py-4"><h2 className="card-title">Invoice</h2></div>
            <table className="w-full min-w-[600px] border-collapse text-sm"><thead><tr className="text-left text-xs text-arang-muted">{['Nomor', 'Klien', 'Jumlah', 'Jatuh tempo', 'Status'].map((h, i) => <th key={h} className={`px-3 py-2.5 font-semibold first:pl-5 ${i === 2 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                {!invoices.length && <tr className="border-t border-line-soft"><td colSpan={5} className="px-5 py-6 text-center text-arang-muted">Belum ada invoice.</td></tr>}
                {invoices.map((i) => { const s = invoiceStatus(i); return (
                  <tr key={i.id} onClick={() => setSel(i.id)} className="cursor-pointer border-t border-line-soft" style={{ background: preview?.id === i.id ? '#F7FBFA' : undefined, opacity: i.status === 'void' ? 0.65 : 1 }}>
                    <td className="whitespace-nowrap py-3 pl-5 pr-3"><button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-arang" onClick={() => setSel(i.id)}>{i.number}</button></td><td className="px-3 py-3"><span className="flex flex-col"><span className="font-semibold">{nameOf(i)}</span><span className="text-xs text-arang-muted">{i.items[0]?.description}{i.items.length > 1 ? ` +${i.items.length - 1} lainnya` : ''}</span></span></td>
                    <td className="tabular px-3 py-3 text-right font-bold">{rupiah(invoiceTotal(i))}</td><td className="whitespace-nowrap px-3 py-3 text-arang-body">{fmtDate(i.dueDate)}</td><td className="px-3 py-3"><Pill bg={TONE[s][0]} fg={TONE[s][1]} className="font-bold">{s}</Pill></td></tr>); })}
              </tbody></table></section>
          <section className="card flex flex-col gap-3.5 p-5"><h2 className="card-title">Anggaran per proyek</h2>
            {!bProjects.length && <span className="text-sm text-arang-muted">Belum ada proyek dengan anggaran.</span>}
            {bProjects.map((p) => { const v = pct(p.spent, p.budget); return <div key={p.id} className="flex flex-col gap-1.5"><div className="flex justify-between gap-3 text-sm"><span className="font-semibold">{p.shortName}</span><span className="text-arang-muted">{rupiahJt(p.spent)} dari {rupiahJt(p.budget)}</span></div><Progress value={v} h={8} color={v > 100 ? '#B42318' : v >= 75 ? '#F2B33D' : '#0F9D8A'} /></div>; })}
          </section>
          <section aria-label="Pengeluaran" className="card flex flex-col p-5"><div className="mb-2 flex items-baseline justify-between"><h2 className="card-title">Pengeluaran</h2><span className="text-[13px] text-arang-muted">{rupiah(expenses.reduce((s, e) => s + e.amount, 0))}</span></div>
            {!expenses.length && <span className="text-sm text-arang-muted">Belum ada pengeluaran.</span>}
            {sortedExp.slice(0, allExp ? undefined : 8).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 border-t border-line-soft py-2 text-sm">
                <span className="flex min-w-0 flex-col"><span className="truncate font-semibold">{e.title}</span><span className="text-xs text-arang-muted">{fmtDate(e.date)} · {projectOf(e.projectId)} · {cap(e.category)}</span></span>
                <span className="flex shrink-0 items-center gap-1"><span className="tabular mr-1 font-semibold">{rupiah(e.amount)}</span>
                  <button type="button" aria-label={`Ubah pengeluaran ${e.title}`} title="Ubah" className="btn-icon border-0" onClick={() => setExp({ expense: e })}><Pencil size={14} /></button>
                  <button type="button" aria-label={`Hapus pengeluaran ${e.title}`} title="Hapus" className="btn-icon border-0 hover:text-danger" onClick={() => window.confirm(`Hapus pengeluaran "${e.title}" (${rupiah(e.amount)})?`) && deleteExpense(e.id)}><Trash2 size={14} /></button></span>
              </div>
            ))}
            {expenses.length > 8 && <button type="button" className="btn btn-ghost btn-sm mt-2 self-start" onClick={() => setAllExp(!allExp)}>{allExp ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${expenses.length})`}</button>}
          </section>
        </div>
        {preview && <InvoicePreview key={preview.id} invoice={preview} onEdit={() => setForm({ invoice: preview })} onCompany={() => setCompany(true)} />}
      </div>

      {form && <InvoiceDialog invoice={form.invoice} onClose={() => setForm(null)} onSaved={saved} />}
      {exp && <ExpenseDialog expense={exp.expense} onClose={() => setExp(null)} />}
      {company && <CompanyDialog onClose={() => setCompany(false)} />}
    </div>
  );
};
