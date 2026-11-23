import { describe, expect, it } from 'vitest';
import { addDays, diffDays, fmtClock, fmtDue, fmtDuration, parseISODate, pct, randomToken, rupiah, rupiahJt, todayISO, toISODate } from './format';
import { buildIcs } from './ics';
import { TEMPLATES } from './templates';
import { burndownSeries } from '../components/Burndown';
import type { Project, Task } from '../types';

describe('tanggal', () => {
  it('addDays dan diffDays konsisten, termasuk lintas bulan dan tahun', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-11-01', '2026-11-30')).toBe(29);
    expect(diffDays('2026-11-30', '2026-11-01')).toBe(-29);
  });
  it('parseISODate memakai tanggal lokal (tidak bergeser zona waktu)', () => {
    const d = parseISODate('2026-11-17');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 17]);
    expect(toISODate(d)).toBe('2026-11-17');
  });
  it('fmtDue memberi label relatif', () => {
    const t = todayISO();
    expect(fmtDue(t)).toBe('Hari ini');
    expect(fmtDue(addDays(t, 1))).toBe('Besok');
    expect(fmtDue(addDays(t, -2))).toMatch(/^Terlambat/);
    expect(fmtDue(addDays(t, -2), true)).not.toMatch(/Terlambat/); // tugas selesai tidak dianggap terlambat
  });
});

describe('angka dan uang', () => {
  it('rupiah memakai pemisah titik', () => {
    expect(rupiah(16_000_000)).toBe('Rp16.000.000');
    expect(rupiah(0)).toBe('Rp0');
  });
  it('rupiahJt meringkas ke juta', () => {
    expect(rupiahJt(186_000_000)).toBe('Rp186 jt');
    expect(rupiahJt(20_800_000)).toBe('Rp20,8 jt');
  });
  it('pct aman terhadap pembagi nol', () => {
    expect(pct(1, 0)).toBe(0);
    expect(pct(1, 4)).toBe(25);
  });
  it('durasi dan jam', () => {
    expect(fmtClock(5050)).toBe('01:24:10');
    expect(fmtDuration(3600 + 24 * 60)).toBe('1 j 24 m');
  });
});

describe('randomToken', () => {
  it('panjang sesuai, hanya huruf/angka, dan tidak berulang', () => {
    const a = randomToken(24);
    expect(a).toHaveLength(24);
    expect(a).toMatch(/^[A-Za-z0-9]+$/);
    expect(randomToken(24)).not.toBe(a);
  });
});

const task = (o: Partial<Task>): Task => ({
  id: 't', projectId: 'p', title: 'Tugas', description: '', status: 'todo', priority: 'medium', assigneeId: 'u', watcherIds: [], label: 'Desain',
  startDate: '2026-11-01', dueDate: '2026-11-10', loggedSeconds: 0, subtasks: [], dependencies: [], attachments: [], createdBy: 'u', createdAt: '', updatedAt: '', ...o,
});
const project = { id: 'p', name: 'Proyek', shortName: 'Proyek', startDate: '2026-11-01', dueDate: '2026-11-11' } as Project;

describe('ics', () => {
  it('menghasilkan VEVENT sehari penuh dan meloloskan karakter khusus', () => {
    const ics = buildIcs([task({ id: 'a1', title: 'Rapat; penting, sekali', dueDate: '2026-12-31' })], [project], 'Uji');
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics).toContain('UID:a1@rampung.id');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101');
    expect(ics).toContain('SUMMARY:Rapat\\; penting\\, sekali');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('menandai tugas selesai dan melipat baris panjang (<=75 karakter)', () => {
    const ics = buildIcs([task({ status: 'done', title: 'x'.repeat(200) })], [project], 'Uji');
    expect(ics).toContain('[Rampung] ');
    ics.split('\r\n').forEach((l) => expect(l.length).toBeLessThanOrEqual(75));
  });
});

describe('template proyek', () => {
  it('semua template punya rentang hari valid dan kunci unik', () => {
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) for (const x of t.tasks) {
      expect(x.startDay).toBeGreaterThanOrEqual(0);
      expect(x.endDay).toBeGreaterThanOrEqual(x.startDay);
    }
  });
});

describe('burndown', () => {
  it('ideal turun rata dari total ke 0; aktual menghitung tugas selesai per tanggal', () => {
    const today = todayISO();
    const p = { ...project, startDate: addDays(today, -5), dueDate: addDays(today, 5) } as Project;
    const tasks = [
      task({ id: '1', status: 'done', completedAt: `${addDays(today, -3)}T10:00:00` }),
      task({ id: '2', status: 'done', completedAt: `${addDays(today, -1)}T10:00:00` }),
      task({ id: '3' }), task({ id: '4' }),
    ];
    const s = burndownSeries(tasks, p);
    expect(s).toHaveLength(11);
    expect(s[0].ideal).toBe(4);
    expect(s[s.length - 1].ideal).toBe(0);
    expect(s[0].actual).toBe(4); // belum ada yang selesai di hari pertama
    expect(s[3].actual).toBe(3); // 1 selesai sejak hari ke-2
    expect(s[5].actual).toBe(2); // hari ini: 2 selesai
    expect(s[6].actual).toBeNull(); // masa depan belum ada data
  });
  it('tugas selesai tanpa completedAt tidak merusak hitungan', () => {
    const today = todayISO();
    const p = { ...project, startDate: addDays(today, -2), dueDate: addDays(today, 2) } as Project;
    const s = burndownSeries([task({ status: 'done', dueDate: addDays(today, -1) })], p);
    expect(s.find((x) => x.date === today)?.actual).toBe(0);
  });
});
