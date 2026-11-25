import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { prisma } from '../src/db';
import { createApp } from '../src/app';
import { resetPlanConfig } from '../src/services/planConfig';

export const PASSWORD = 'rahasia123';
// Aplikasi yang sama persis dengan produksi (CORS, batas body, penangan error).
export const app = createApp();

/** Pengaman: helper ini menghapus data, jadi hanya boleh berjalan di database tes. */
function assertTestDatabase() {
  const name = new URL(process.env.DATABASE_URL || 'mysql://x/none').pathname;
  if (!name.endsWith('_test')) throw new Error(`Bukan database tes: ${name}`);
}

export async function resetDb() {
  assertTestDatabase();
  // Bukti transfer hasil tes dihapus dari disk agar tidak menumpuk di uploads/proofs.
  const proofs = await prisma.payments.findMany({ where: { proof_file: { not: null } }, select: { proof_file: true } });
  for (const p of proofs) fs.rmSync(path.join(__dirname, '../uploads/proofs', path.basename(p.proof_file!)), { force: true });
  await prisma.payments.deleteMany();
  await prisma.platform_settings.deleteMany();
  resetPlanConfig();
  await prisma.api_tokens.deleteMany();
  await prisma.records.deleteMany();
  await prisma.uploads.deleteMany();
  await prisma.invites.deleteMany();
  await prisma.password_reset_tokens.deleteMany();
  await prisma.users.deleteMany();
  await prisma.workspaces.deleteMany();
}

/** Paket untuk workspace yang dibuat signUp() (bukan lewat undangan). Bawaan Gratis, seperti produksi. */
let defaultPlan: 'gratis' | 'pro' | 'bisnis' | 'enterprise' = 'gratis';
export const useDefaultPlan = (p: typeof defaultPlan) => {
  defaultPlan = p;
};

/** Tetapkan paket berbayar langsung di database (untuk tes; di produksi lewat pembayaran/superadmin). */
export async function setPlan(workspaceId: number, plan: typeof defaultPlan, days = 30) {
  await prisma.workspaces.update({ where: { id: BigInt(workspaceId) }, data: { plan, plan_until: plan === 'gratis' ? null : new Date(Date.now() + days * 864e5) } });
}

export interface Account { token: string; id: number; me: string; workspaceId: number; role: string }

let seq = 0;
export async function signUp(name = 'Sari', opts: { email?: string; invite?: string } = {}): Promise<Account> {
  const email = opts.email ?? `${name.toLowerCase().replace(/\W/g, '')}${Date.now()}${seq++}@test.id`;
  const res = await request(app).post('/api/auth/register').send({ name, email, password: PASSWORD, invite: opts.invite });
  if (res.status !== 201 && res.status !== 200) throw new Error(`register gagal: ${res.status} ${JSON.stringify(res.body)}`);
  const u = res.body.user;
  if (!opts.invite && defaultPlan !== 'gratis') await setPlan(u.workspace_id, defaultPlan);
  return { token: res.body.token, id: u.id, me: `u${u.id}`, workspaceId: u.workspace_id, role: u.role };
}

export const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

export const push = (token: string, changes: unknown) => request(app).post('/api/sync').set(auth(token)).send({ changes });
export const pull = (token: string) => request(app).get('/api/sync').set(auth(token));

/** Pemilik + satu anggota (atau admin) yang bergabung lewat undangan. */
export async function team(memberRole: 'member' | 'admin' = 'member') {
  const owner = await signUp('Pemilik');
  const email = `anggota${Date.now()}${seq++}@test.id`;
  const inv = await request(app).post('/api/invites').set(auth(owner.token)).send({ email, role: memberRole });
  if (inv.status !== 201) throw new Error(`undangan gagal: ${inv.status} ${JSON.stringify(inv.body)}`);
  const member = await signUp('Anggota', { email, invite: inv.body.token });
  return { owner, member };
}

export const task = (id: string, title = 'Tugas') => ({ c: 'tasks', id, data: { id, title, projectId: 'p1' } });
