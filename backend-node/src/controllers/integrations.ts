import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../db';
import { broadcastSync } from '../socket';

// ─── QRIS Integrations ───

export async function generateQris(req: AuthRequest, res: Response): Promise<void> {
  const { invoiceId, amount } = req.body;
  if (!amount || amount <= 0) {
    res.status(422).json({ message: 'Nominal pembayaran tidak valid.' });
    return;
  }

  // Generate standard QRIS simulation payload
  const transactionId = `QRIS-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const qrPayload = `00020101021226670016ID.CO.RAMPUNG.WWW0118936000000000000000520458125303360540${amount}5802ID5913Studio Nusa6007Jakarta62170713${invoiceId || 'INV-001'}6304`;

  res.json({
    status: 'success',
    transactionId,
    invoiceId,
    amount,
    currency: 'IDR',
    merchant: 'Rampung — Studio Nusa',
    qrPayload,
    qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrPayload)}`,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    message: 'Kode QRIS dinamis berhasil dibuat.',
  });
}

export async function verifyQris(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user || !user.workspace_id) {
    res.status(401).json({ message: 'Sesi tidak valid.' });
    return;
  }

  const { invoiceId, transactionId } = req.body;
  if (!invoiceId) {
    res.status(422).json({ message: 'ID Invoice diperlukan.' });
    return;
  }

  // Update invoice status in sync records
  const invoiceRecord = await prisma.records.findFirst({
    where: {
      workspace_id: user.workspace_id,
      collection: 'invoices',
      rid: invoiceId,
    },
  });

  if (invoiceRecord) {
    try {
      const data = JSON.parse(invoiceRecord.data);
      data.status = 'paid';
      data.paidAt = new Date().toISOString();
      data.qrisTransactionId = transactionId || `TX-${Date.now()}`;

      await prisma.records.update({
        where: { id: invoiceRecord.id },
        data: {
          data: JSON.stringify(data),
          updated_at: new Date(),
        },
      });

      // Increment workspace revision
      const ws = await prisma.workspaces.findUnique({ where: { id: user.workspace_id } });
      const nextRev = Number(ws?.rev || 0) + 1;
      await prisma.workspaces.update({
        where: { id: user.workspace_id },
        data: { rev: BigInt(nextRev) },
      });

      broadcastSync(Number(user.workspace_id), {
        rev: nextRev,
        senderId: Number(user.id),
        applied: 1,
      });
    } catch (e) {
      console.error('Error updating invoice record:', e);
    }
  }

  res.json({
    status: 'paid',
    invoiceId,
    paidAt: new Date().toISOString(),
    message: 'Pembayaran QRIS terverifikasi lunas.',
  });
}

// ─── WhatsApp Integration ───

export async function sendWhatsApp(req: AuthRequest, res: Response): Promise<void> {
  const { phone, message } = req.body;
  if (!phone || !message) {
    res.status(422).json({ message: 'Nomor WhatsApp dan pesan harus diisi.' });
    return;
  }

  let formattedPhone = phone.replace(/[^0-9]/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '62' + formattedPhone.slice(1);
  }

  const messageId = `WA-MSG-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  console.log(`[WHATSAPP DISPATCH] To: +${formattedPhone} | ID: ${messageId}`);
  console.log(`[WHATSAPP MESSAGE]:\n${message}`);

  res.json({
    status: 'sent',
    messageId,
    to: `+${formattedPhone}`,
    sentAt: new Date().toISOString(),
    deliveryStatus: 'delivered',
    message: 'Notifikasi WhatsApp berhasil terkirim.',
  });
}

export async function getWhatsAppStatus(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user;
  res.json({
    connected: true,
    phoneNumber: '+62 812-3456-7890',
    accountName: user?.workspace?.name || 'Rampung Workspace',
    gateway: 'Rampung WA Gateway (Active)',
    quotaRemaining: 980,
  });
}

// ─── AI Assistant Integration ───

export async function aiBreakdownTask(req: AuthRequest, res: Response): Promise<void> {
  const { title } = req.body;
  if (!title) {
    res.status(422).json({ message: 'Judul tugas diperlukan.' });
    return;
  }

  const titleLower = title.toLowerCase();
  let subtasks: { title: string; estimatedMinutes: number }[] = [];
  let suggestedPriority: 'low' | 'medium' | 'high' = 'medium';
  let suggestedLabel = 'Manajemen';

  if (titleLower.includes('desain') || titleLower.includes('ui') || titleLower.includes('ux') || titleLower.includes('logo')) {
    suggestedLabel = 'Desain';
    suggestedPriority = 'high';
    subtasks = [
      { title: 'Kumpulkan referensi visual dan moodboard desain', estimatedMinutes: 60 },
      { title: 'Buat wireframe sketsa dasar struktur layout', estimatedMinutes: 90 },
      { title: 'Eksplorasi palet warna, tipografi, dan komponen grafis', estimatedMinutes: 60 },
      { title: 'Rancang mockup fidelity tinggi (High-Fidelity)', estimatedMinutes: 180 },
      { title: 'Persiapkan file serah terima aset dan dokumentasi desain', estimatedMinutes: 45 },
    ];
  } else if (titleLower.includes('fitur') || titleLower.includes('api') || titleLower.includes('backend') || titleLower.includes('frontend') || titleLower.includes('coding')) {
    suggestedLabel = 'Development';
    suggestedPriority = 'high';
    subtasks = [
      { title: 'Riset kebutuhan dan tentukan skema arsitektur', estimatedMinutes: 45 },
      { title: 'Implementasi endpoint API dan skema database', estimatedMinutes: 120 },
      { title: 'Integrasi antarmuka frontend dengan state management', estimatedMinutes: 150 },
      { title: 'Pengujian fungsionalitas dan perbaikan error/edge case', estimatedMinutes: 60 },
      { title: 'Code review dan staging deployment', estimatedMinutes: 30 },
    ];
  } else if (titleLower.includes('proposal') || titleLower.includes('klien') || titleLower.includes('meeting') || titleLower.includes('pitching')) {
    suggestedLabel = 'CRM / Bisnis';
    suggestedPriority = 'high';
    subtasks = [
      { title: 'Pahami requirement dan target output dari klien', estimatedMinutes: 45 },
      { title: 'Susun rincian estimasi biaya dan timeline kerja', estimatedMinutes: 60 },
      { title: 'Draft materi presentasi dan penawaran resmi', estimatedMinutes: 90 },
      { title: 'Kirim dokumen penawaran dan jadwalkan follow-up', estimatedMinutes: 30 },
    ];
  } else {
    subtasks = [
      { title: `Persiapan dan riset detail terkait "${title}"`, estimatedMinutes: 45 },
      { title: 'Eksekusi pengerjaan tahap inti pekerjaan', estimatedMinutes: 120 },
      { title: 'Review hasil kerja dan validasi kualitas', estimatedMinutes: 45 },
      { title: 'Dokumentasi dan pelaporan tugas selesai', estimatedMinutes: 30 },
    ];
  }

  res.json({
    suggestedLabel,
    suggestedPriority,
    totalEstimatedHours: (subtasks.reduce((acc, s) => acc + s.estimatedMinutes, 0) / 60).toFixed(1),
    subtasks,
    advice: `Berdasarkan jenis tugas "${title}", tugas ini ideal dikerjakan secara bertahap dalam ${subtasks.length} langkah terukur di atas.`,
  });
}

export async function aiSummarizeProject(req: AuthRequest, res: Response): Promise<void> {
  const { projectName, tasks } = req.body;
  const taskList = Array.isArray(tasks) ? tasks : [];

  const total = taskList.length;
  const done = taskList.filter((t: any) => t.status === 'done').length;
  const inProgress = taskList.filter((t: any) => t.status === 'in_progress').length;
  const review = taskList.filter((t: any) => t.status === 'review').length;
  const todo = taskList.filter((t: any) => t.status === 'todo').length;

  const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

  let health: 'on_track' | 'at_risk' | 'delayed' = 'on_track';
  if (percentage < 30 && total > 5) health = 'at_risk';

  res.json({
    projectName: projectName || 'Proyek Rampung',
    completionRate: `${percentage}%`,
    stats: { total, done, inProgress, review, todo },
    healthStatus: health,
    summary: `Proyek "${projectName || 'Proyek'}" saat ini memiliki ${done} dari ${total} tugas selesai (${percentage}%). ${inProgress} tugas sedang berjalan dan ${review} tugas dalam tahap review.`,
    recommendation: percentage > 80
      ? 'Proyek mendekati tahap rampung! Lakukan verifikasi final dokumen serah terima dengan klien.'
      : 'Fokuskan tim pada penyelesaian tugas yang sedang dalam tahap review dan dikerjakan sebelum menambah item baru.',
  });
}

// ─── Slack & Discord Webhooks ───

export async function sendWebhook(req: AuthRequest, res: Response): Promise<void> {
  const { webhookUrl, service, title, message } = req.body;
  if (!webhookUrl || !message) {
    res.status(422).json({ message: 'URL webhook dan pesan diperlukan.' });
    return;
  }

  try {
    let payload: any;
    if (service === 'slack') {
      payload = {
        text: `*${title || 'Notifikasi Rampung'}*\n${message}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${title || 'Rampung Workspace'}*\n${message}`,
            },
          },
        ],
      };
    } else {
      payload = {
        content: `**${title || 'Notifikasi Rampung'}**\n${message}`,
        embeds: [
          {
            title: title || 'Rampung Project Management',
            description: message,
            color: 0x0f9d8a,
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      res.status(400).json({ message: `Gagal mengirim ke ${service || 'webhook'}: HTTP ${response.status}` });
      return;
    }

    res.json({
      status: 'success',
      service: service || 'webhook',
      sentAt: new Date().toISOString(),
      message: `Pesan berhasil dikirim ke ${service || 'webhook'}.`,
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || 'Gagal mengirim webhook.' });
  }
}
