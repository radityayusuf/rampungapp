import { Response } from 'express';
import { prisma } from '../db';
import { LIMITS, PLAN_LABEL, Plan, atLeast, effectivePlan, isActiveProject, sanitizeModules } from './plans';

export async function planOf(wsId: bigint): Promise<{ plan: Plan; stored: string; until: Date | null; trialUsed: boolean }> {
  const ws = await prisma.workspaces.findUnique({ where: { id: wsId }, select: { plan: true, plan_until: true, trial_used: true } });
  if (!ws) return { plan: 'gratis', stored: 'gratis', until: null, trialUsed: false };
  return { plan: effectivePlan(ws), stored: ws.plan, until: ws.plan_until, trialUsed: ws.trial_used };
}

/** Kirim 402 bila paket belum mencukupi. Mengembalikan true bila boleh lanjut. */
export async function requirePlan(res: Response, wsId: bigint, min: Plan, feature: string): Promise<boolean> {
  const { plan } = await planOf(wsId);
  if (atLeast(plan, min)) return true;
  res.status(402).json({ message: `${feature} tersedia mulai paket ${PLAN_LABEL[min]}. Paket Anda saat ini: ${PLAN_LABEL[plan]}.`, plan, requiredPlan: min });
  return false;
}

/** Data paket yang disisipkan ke catatan "workspace" agar klien selalu melihat nilai dari server. */
export function stampWorkspaceRecord(data: Record<string, unknown>, p: { plan: Plan; until: Date | null }) {
  return {
    ...data,
    plan: p.plan,
    planUntil: p.plan === 'gratis' ? null : p.until?.toISOString() ?? null,
    enabledModules: sanitizeModules(p.plan, data.enabledModules),
  };
}

export async function memberCount(wsId: bigint) {
  return prisma.users.count({ where: { workspace_id: wsId } });
}

/** null bila boleh; pesan galat bila batas anggota paket terlampaui oleh `adding` orang lagi. */
export async function memberLimitError(wsId: bigint, adding: number, includePendingInvites: boolean, excludeEmail?: string): Promise<string | null> {
  const { plan } = await planOf(wsId);
  const max = LIMITS[plan].members;
  if (max === null) return null;
  const members = await memberCount(wsId);
  const pending = includePendingInvites ? await prisma.invites.count({ where: { workspace_id: wsId, accepted_at: null, ...(excludeEmail ? { NOT: { email: excludeEmail } } : {}) } }) : 0;
  return members + pending + adding > max
    ? `Paket ${PLAN_LABEL[plan]} maksimal ${max} anggota (termasuk undangan yang belum diterima). Tingkatkan paket untuk menambah anggota.`
    : null;
}

export async function activeProjectCount(wsId: bigint) {
  const rows = await prisma.records.findMany({ where: { workspace_id: wsId, collection: 'projects' }, select: { rid: true, data: true } });
  const map = new Map<string, unknown>();
  for (const r of rows) {
    try {
      map.set(r.rid, JSON.parse(r.data));
    } catch {
      // abaikan catatan rusak
    }
  }
  return map;
}

export { isActiveProject };
