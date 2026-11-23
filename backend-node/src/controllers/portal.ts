import { Request, Response } from 'express';
import { prisma } from '../db';

export async function show(req: Request, res: Response): Promise<void> {
  const token = String(req.params.token || '');
  if (!token || !/^[A-Za-z0-9]{16,64}$/.test(token)) {
    res.status(404).json({ message: 'Portal tidak ditemukan.' });
    return;
  }

  // Find project with portalToken matching
  const projectRecords = await prisma.records.findMany({
    where: {
      collection: 'projects',
    },
  });

  let targetProject: any = null;
  let workspaceId: bigint | null = null;

  for (const r of projectRecords) {
    try {
      const data = JSON.parse(r.data);
      if (data.portalToken === token && data.clientPortalEnabled) {
        targetProject = data;
        workspaceId = r.workspace_id;
        break;
      }
    } catch {
      // ignore
    }
  }

  if (!targetProject || !workspaceId) {
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
