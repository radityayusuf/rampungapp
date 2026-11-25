import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import type { Invoice } from '../types';
import { fmtDate, rupiah } from '../lib/format';

/**
 * Status pembayaran satu invoice. Pembayaran klien masuk langsung ke rekening/kas pemilik workspace,
 * jadi pelunasan dikonfirmasi manual oleh pemilik/admin setelah dana benar-benar diterima.
 * Rampung tidak menampilkan kode QR karangan dan tidak melunasi invoice tanpa konfirmasi nyata.
 */
export const InvoicePayment: React.FC<{ invoice: Invoice; total: number }> = ({ invoice, total }) => {
  const { canManage, markInvoicePaid } = useApp();

  if (invoice.status === 'paid') {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-brand-soft p-3.5 text-[13px] font-semibold" style={{ color: '#0B5F54' }}>
        <CheckCircle2 size={16} />
        Lunas{invoice.paidAt ? ` pada ${fmtDate(invoice.paidAt.slice(0, 10))}` : ''} · dikonfirmasi manual
      </div>
    );
  }

  const confirm = () => {
    if (window.confirm(`Tandai ${invoice.number} (${rupiah(total)}) sebagai LUNAS?\n\nGunakan ini hanya setelah Anda benar-benar menerima pembayaran (transfer bank, QRIS toko Anda, atau tunai).`)) markInvoicePaid(invoice.id);
  };

  return (
    <div className="no-print flex flex-col gap-3 rounded-xl border border-line-soft bg-canvas p-3.5">
      <span className="text-[13px] text-arang-body">Terima pembayaran klien lewat transfer, QRIS toko Anda, atau tunai, lalu tandai lunas setelah dana masuk.</span>
      {canManage && <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-outline" onClick={confirm}>Tandai lunas (manual)</button></div>}
    </div>
  );
};
