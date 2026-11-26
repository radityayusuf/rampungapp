import { describe, expect, it } from 'vitest';
import { invoiceStatus, invoiceSubtotal, invoiceTax, invoiceTotal, nextInvoiceNumber, toItems } from './invoice';
import { addDays, buildTaskKeys, nextTaskNum, todayISO } from './format';

describe('invoice', () => {
  it('subtotal, PPN, dan total', () => {
    const i = { items: [{ description: 'a', amount: 1_000_000 }, { description: 'b', qty: 2, price: 250_000, amount: 500_000 }], taxRate: 11 };
    expect([invoiceSubtotal(i), invoiceTax(i), invoiceTotal(i)]).toEqual([1_500_000, 165_000, 1_665_000]);
    expect(invoiceTotal({ items: i.items })).toBe(1_500_000);
    expect(invoiceTax({ items: [{ description: 'x', amount: 333 }], taxRate: 11 })).toBe(37); // dibulatkan ke rupiah
  });

  it('nomor berurutan per tahun dan awalan; nomor tertinggi tidak dipakai ulang', () => {
    expect(nextInvoiceNumber([], '2026-11-25')).toBe('INV-2026-001');
    const list = [{ number: 'INV-2026-011' }, { number: 'INV-2026-012' }, { number: 'INV-2025-900' }, { number: 'ABC-2026-050' }, { number: 'INV-2026-X99' }];
    expect(nextInvoiceNumber(list, '2026-12-01')).toBe('INV-2026-013');
    expect(nextInvoiceNumber(list, '2027-01-02')).toBe('INV-2027-001');
    expect(nextInvoiceNumber(list, '2026-12-01', 'ABC')).toBe('ABC-2026-051');
    expect(nextInvoiceNumber(list, '2026-12-01', '  ')).toBe('INV-2026-013');
    expect(nextInvoiceNumber([{ number: 'INV-2026-999' }], '2026-12-01')).toBe('INV-2026-1000');
  });

  it('baris formulir: yang tidak lengkap diabaikan, jumlah pecahan didukung', () => {
    expect(toItems([{ description: ' Desain ', qty: '1.5', price: '200000' }, { description: '', qty: '1', price: '5' }, { description: 'x', qty: '0', price: '5' }, { description: 'y', qty: '1', price: '-5' }, { description: 'z', qty: 'abc', price: '1' }]))
      .toEqual([{ description: 'Desain', qty: 1.5, price: 200000, amount: 300000 }]);
  });

  it('status', () => {
    const t = todayISO();
    expect(invoiceStatus({ status: 'unpaid', dueDate: t })).toBe('Menunggu');
    expect(invoiceStatus({ status: 'unpaid', dueDate: addDays(t, -1) })).toBe('Lewat tempo');
    expect(invoiceStatus({ status: 'paid', dueDate: addDays(t, -1) })).toBe('Lunas');
    expect(invoiceStatus({ status: 'void', dueDate: addDays(t, -1) })).toBe('Dibatalkan');
  });
});

describe('kunci tiket', () => {
  const p = [{ id: 'p', shortName: 'Toko Kopi', name: 'Toko Kopi' }];
  const t = (id: string, num: number | undefined, at: string) => ({ id, projectId: 'p', num, createdAt: at });

  it('nomor kembar dari data lama tetap menjadi kunci unik dan tidak berubah saat tugas bertambah', () => {
    const tasks = [t('a', 1, '1'), t('b', 2, '2'), t('c', 2, '3'), t('d', 2, '4')];
    const keys = buildTaskKeys(tasks, p);
    expect([...keys.values()].sort()).toEqual(['TK-1', 'TK-2', 'TK-3', 'TK-4']);
    expect(keys.get('b')).toBe('TK-2'); // yang lebih dulu memegang nomornya
    const next = nextTaskNum(tasks, 'p');
    expect(next).toBe(5);
    const more = buildTaskKeys([...tasks, t('e', next, '5')], p);
    for (const [id, k] of keys) expect(more.get(id)).toBe(k);
    expect(new Set(more.values()).size).toBe(5);
  });

  it('tugas lama tanpa nomor tidak bentrok dengan yang bernomor', () => {
    const keys = buildTaskKeys([t('x', undefined, '1'), t('y', undefined, '2'), t('z', 2, '3')], p);
    expect(new Set(keys.values()).size).toBe(3);
    expect([keys.get('x'), keys.get('y')]).toEqual(['TK-1', 'TK-2']);
  });
});
