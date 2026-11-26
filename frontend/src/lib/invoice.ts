import type { Invoice, InvoiceItem } from '../types';
import { isOverdue } from './format';

export const invoiceSubtotal = (i: Pick<Invoice, 'items'>) => i.items.reduce((s, x) => s + x.amount, 0);
export const invoiceTax = (i: Pick<Invoice, 'items' | 'taxRate'>) => Math.round((invoiceSubtotal(i) * (i.taxRate ?? 0)) / 100);
export const invoiceTotal = (i: Pick<Invoice, 'items' | 'taxRate'>) => invoiceSubtotal(i) + invoiceTax(i);

export type InvoiceLabel = 'Lunas' | 'Lewat tempo' | 'Menunggu' | 'Dibatalkan';
export const invoiceStatus = (i: Pick<Invoice, 'status' | 'dueDate'>): InvoiceLabel =>
  i.status === 'void' ? 'Dibatalkan' : i.status === 'paid' ? 'Lunas' : isOverdue(i.dueDate) ? 'Lewat tempo' : 'Menunggu';

/**
 * Nomor invoice berikutnya: AWALAN-TAHUN-URUT (mis. INV-2026-001), dihitung per awalan dan tahun dari nomor tertinggi.
 * Nomor invoice yang dibatalkan tidak dipakai ulang.
 */
export const nextInvoiceNumber = (invoices: Pick<Invoice, 'number'>[], issueDate: string, prefix = 'INV'): string => {
  const head = `${prefix.trim() || 'INV'}-${issueDate.slice(0, 4)}-`;
  const max = invoices.reduce((m, i) => {
    const tail = i.number.startsWith(head) ? i.number.slice(head.length) : '';
    return /^\d+$/.test(tail) ? Math.max(m, Number(tail)) : m;
  }, 0);
  return head + String(max + 1).padStart(3, '0');
};

/** Baris formulir → baris invoice. Baris kosong diabaikan. */
export const toItems = (rows: { description: string; qty: string; price: string }[]): InvoiceItem[] =>
  rows
    .map((r) => ({ description: r.description.trim(), qty: Number(r.qty), price: Math.round(Number(r.price)) }))
    .filter((r) => r.description && r.qty > 0 && r.price > 0)
    .map((r) => ({ ...r, amount: Math.round(r.qty * r.price) }));
