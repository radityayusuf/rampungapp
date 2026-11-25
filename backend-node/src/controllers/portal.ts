import { Request, Response } from 'express';
import { prisma } from '../db';
import { atLeast } from '../services/plans';
import { planOf } from '../services/workspacePlan';

export async function show(req: Request, res: Response): Promise<void> {
  const token = String(req.params.token || '');
  if (!token || !/^[A-Za-z0-9]{16,64}$/.test(token)) {
    res.status(404).json({ message: 'Portal tidak ditemukan.' });
    return;
  }

  // Cari langsung di database (token sudah dipastikan hanya huruf/angka, jadi aman untuk LIKE),
  // bukan memuat dan mem-parse SEMUA proyek dari SEMUA workspace pada setiap permintaan publik.
  const candidates = await prisma.records.findMany({
    where: { collection: 'projects', data: { contains: `"portalToken":"${token}"` } },
    take: 5,
  });

  let targetProject: any = null;
  let workspaceId: bigint | null = null;

  for (const r of candidates) {
    try {
      const data = JSON.parse(r.data);
      if (data.portalToken === token && data.clientPortalEnabled === true) {
        targetProject = data;
        workspaceId = r.workspace_id;
        break;
      }
    } catch {
      // abaikan data rusak
    }
  }

  // Portal klien termasuk paket Bisnis; bila paket turun, portal ikut tidak tersedia (tanpa membocorkan alasannya ke publik).
  if (!targetProject || !workspaceId || !atLeast((await planOf(workspaceId)).plan, 'bisnis')) {
    res.status(404).json({ message: 'Portal tidak ditemukan atau sudah dinonaktifkan.' });
    return;
  }

  const ws = await prisma.workspaces.findUnique({
    where: { id: workspaceId },
  });

  const memberAndClientRecords = await prisma.records.findMany({
    where: {
      workspace_id: workspaceId,
      collection: { in: ['members', 'clients'] },
    },
  });

  const members: Record<string, string> = {};
  let clientCompany: string | null = null;

  for (const r of memberAndClientRecords) {
    try {
      const d = JSON.parse(r.data);
      if (r.collection === 'members') {
        members[d.id] = d.name || '';
      } else if (r.collection === 'clients' && targetProject.clientId === d.id) {
        clientCompany = d.company || null;
      }
    } catch {
      // ignore
    }
  }

  const taskRecords = await prisma.records.findMany({
    where: {
      workspace_id: workspaceId,
      collection: 'tasks',
    },
  });

  const tasks: any[] = [];
  for (const r of taskRecords) {
    try {
      const t = JSON.parse(r.data);
      if (t.projectId === targetProject.id) {
        const subtasks = Array.isArray(t.subtasks) ? t.subtasks : [];
        tasks.push({
          title: t.title || '',
          status: t.status || 'todo',
          dueDate: t.dueDate || null,
          assignee: members[t.assigneeId] || null,
          subtasks: subtasks.length,
          subtasksDone: subtasks.filter((s: any) => !!s.completed).length,
        });
      }
    } catch {
      // ignore
    }
  }

  res.json({
    workspace: ws?.name || 'Workspace',
    client: clientCompany,
    project: {
      name: targetProject.name,
      description: targetProject.description || '',
      startDate: targetProject.startDate || null,
      dueDate: targetProject.dueDate || null,
    },
    tasks,
  });
}
