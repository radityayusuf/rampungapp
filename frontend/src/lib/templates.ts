import type { Priority } from '../types';

export interface TemplateTask {
  title: string;
  label: string;
  priority: Priority;
  startDay: number; // hari ke-n sejak proyek mulai
  endDay: number;
  subtasks?: string[];
  milestone?: boolean;
}

export interface ProjectTemplate {
  key: string;
  label: string;
  desc: string;
  tasks: TemplateTask[];
}

/** Template proyek awal. Tanggal dihitung relatif dari tanggal mulai proyek. */
export const TEMPLATES: ProjectTemplate[] = [
  { key: 'kosong', label: 'Kosong', desc: 'Mulai dari nol.', tasks: [] },
  {
    key: 'scrum',
    label: 'Sprint (tim software)',
    desc: 'Backlog, sprint 2 minggu, review, dan retrospektif.',
    tasks: [
      { title: 'Susun backlog produk', label: 'Manajemen', priority: 'high', startDay: 0, endDay: 2, subtasks: ['Kumpulkan kebutuhan', 'Prioritaskan user story'] },
      { title: 'Perencanaan sprint 1', label: 'Manajemen', priority: 'high', startDay: 3, endDay: 3 },
      { title: 'Kerjakan item sprint 1', label: 'Backend', priority: 'medium', startDay: 4, endDay: 16, subtasks: ['Fitur utama', 'Pengujian', 'Perbaikan bug'] },
      { title: 'Review sprint 1', label: 'Manajemen', priority: 'medium', startDay: 17, endDay: 17 },
      { title: 'Retrospektif sprint 1', label: 'Manajemen', priority: 'low', startDay: 18, endDay: 18 },
      { title: 'Rilis versi pertama', label: 'Manajemen', priority: 'high', startDay: 20, endDay: 20, milestone: true },
    ],
  },
  {
    key: 'agensi',
    label: 'Proyek klien (agensi kreatif)',
    desc: 'Brief, konsep, desain, revisi, dan serah terima.',
    tasks: [
      { title: 'Kickoff dan brief klien', label: 'Manajemen', priority: 'high', startDay: 0, endDay: 1, subtasks: ['Jadwalkan pertemuan', 'Catat kebutuhan klien'] },
      { title: 'Riset dan referensi', label: 'Riset', priority: 'medium', startDay: 2, endDay: 5 },
      { title: 'Konsep dan moodboard', label: 'Desain', priority: 'high', startDay: 5, endDay: 9 },
      { title: 'Desain versi 1', label: 'Desain', priority: 'high', startDay: 10, endDay: 16, subtasks: ['Layout utama', 'Aset visual', 'Presentasi ke klien'] },
      { title: 'Revisi klien', label: 'Desain', priority: 'medium', startDay: 17, endDay: 21 },
      { title: 'Serah terima dan penagihan', label: 'Manajemen', priority: 'high', startDay: 22, endDay: 24, milestone: false },
    ],
  },
  {
    key: 'event',
    label: 'Acara (event organizer)',
    desc: 'Konsep, venue, sponsor, rundown, hari-H, dan evaluasi.',
    tasks: [
      { title: 'Tentukan konsep dan anggaran acara', label: 'Manajemen', priority: 'high', startDay: 0, endDay: 3 },
      { title: 'Survei dan booking venue', label: 'Manajemen', priority: 'high', startDay: 3, endDay: 8 },
      { title: 'Cari sponsor dan vendor', label: 'Marketing', priority: 'medium', startDay: 5, endDay: 20 },
      { title: 'Promosi dan pendaftaran peserta', label: 'Marketing', priority: 'medium', startDay: 10, endDay: 28 },
      { title: 'Susun rundown dan tugas panitia', label: 'Manajemen', priority: 'high', startDay: 20, endDay: 25 },
      { title: 'Hari-H acara', label: 'Manajemen', priority: 'high', startDay: 30, endDay: 30, milestone: true },
      { title: 'Evaluasi dan laporan kegiatan', label: 'Manajemen', priority: 'medium', startDay: 31, endDay: 35 },
    ],
  },
];
