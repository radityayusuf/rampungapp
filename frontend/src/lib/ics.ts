import type { Project, Task } from '../types';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const ymd = (iso: string) => iso.replace(/-/g, '');
const nextDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}${String(t.getUTCDate()).padStart(2, '0')}`;
};
/** Lipat baris panjang sesuai RFC 5545. */
const fold = (line: string) => (line.length <= 73 ? line : line.match(/.{1,73}/g)!.join('\r\n '));

/** Buat berkas iCalendar (acara sehari penuh pada tenggat tiap tugas). Bisa diimpor ke Google Calendar, Outlook, Apple Calendar. */
export function buildIcs(tasks: Task[], projects: Project[], calName: string) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rampung//Tugas//ID', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(calName)}`];
  for (const t of tasks) {
    const p = projects.find((x) => x.id === t.projectId);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@rampung.id`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(t.dueDate)}`,
      `DTEND;VALUE=DATE:${nextDay(t.dueDate)}`,
      `SUMMARY:${esc((t.status === 'done' ? '[Rampung] ' : '') + t.title)}`,
      `DESCRIPTION:${esc(`${p?.name ?? ''}${t.description ? '\n' + t.description : ''}`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadFile(name: string, content: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
