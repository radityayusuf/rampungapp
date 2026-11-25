import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BellOff, X } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { href } from '../store/router';
import type { Notification } from '../types';
import { Avatar } from './ui';
import { timeAgo } from '../lib/format';

const KIND: Record<Notification['kind'], [string, string, string]> = {
  mention: ['Menyebut Anda', '#F0EBFB', '#5B3AA8'],
  assign: ['Ditugaskan', '#E6EFFA', '#1D5FA8'],
  due: ['Tenggat', '#FDECEA', '#B42318'],
  status: ['Status', '#E3F3F0', '#0B5F54'],
  comment: ['Komentar', '#ECEEEA', '#3D4750'],
};

/** Satu notifikasi: pelaku, isi, kunci tiket, waktu, dan titik "belum dibaca". */
export const NotificationItem: React.FC<{ n: Notification; onOpen?: () => void }> = ({ n, onOpen }) => {
  const { user, markRead, tasks, taskKey } = useApp();
  const [label, bg, fg] = KIND[n.kind] ?? KIND.comment;
  const task = n.taskId ? tasks.find((t) => t.id === n.taskId) : undefined;
  return (
    <a
      href={n.taskId ? href.tugas(n.taskId) : href.inbox}
      onClick={() => { markRead(n.id); onOpen?.(); }}
      className="relative flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-canvas"
      style={{ color: '#1F2933', background: n.read ? undefined : '#F3FAF8' }}
    >
      <Avatar userId={n.actorId} size={34} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[13.5px] leading-snug">
        <span><strong className="font-semibold">{user(n.actorId).shortName}</strong> {n.text}</span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-arang-muted">
          <span className="rounded-md px-1.5 py-[1px] text-[11px] font-semibold" style={{ background: bg, color: fg }}>{label}</span>
          {task && <span className="font-semibold">{taskKey(task.id)}</span>}
          <span>{timeAgo(n.createdAt)}</span>
        </span>
      </div>
      {!n.read && <span aria-label="Belum dibaca" className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-bright" />}
    </a>
  );
};

/** Panel notifikasi geser dari kanan, seperti panel Notifikasi Jira. */
export const NotificationPanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { notifications, me, markAllRead } = useApp();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const mine = notifications.filter((n) => n.userId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const list = onlyUnread ? mine.filter((n) => !n.read) : mine;
  const unread = mine.filter((n) => !n.read).length;

  // Portal ke <body>: bar atas memakai backdrop-filter yang menjadi wadah bagi elemen fixed.
  return createPortal(
    <div className="fixed inset-0 z-[55]">
      <div className="absolute inset-0 bg-arang/20" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Notifikasi" className="toast-in absolute inset-y-0 right-0 flex w-[420px] max-w-[100vw] flex-col bg-white shadow-pop outline-none">
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
          <h2 className="m-0 text-[17px] font-bold">Notifikasi</h2>
          <button type="button" aria-label="Tutup notifikasi" onClick={onClose} className="btn-icon border-0"><X size={18} /></button>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
          <label className="flex cursor-pointer items-center gap-2 text-arang-body">
            <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} style={{ accentColor: '#0B7A6B' }} />
            Hanya yang belum dibaca
          </label>
          {unread > 0 && <button type="button" onClick={markAllRead} className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-brand hover:underline">Tandai semua terbaca</button>}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {list.map((n) => <NotificationItem key={n.id} n={n} onOpen={onClose} />)}
          {!list.length && (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-arang-muted">
              <BellOff size={28} />
              <span className="text-[15px] font-bold text-arang">{onlyUnread ? 'Semua sudah dibaca' : 'Belum ada notifikasi'}</span>
              <span className="max-w-[260px] text-[13px]">Sebutan, penugasan, dan pengingat tenggat akan muncul di sini.</span>
            </div>
          )}
        </div>
        <a href={href.inbox} onClick={onClose} className="border-t border-line-soft px-5 py-3 text-center text-[13.5px] font-semibold">Buka semua di Inbox</a>
      </div>
    </div>,
    document.body,
  );
};
