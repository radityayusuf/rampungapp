import { prisma } from '../db';
import { broadcastSync } from '../socket';

/** Minta semua layar yang terbuka di workspace ini menarik ulang datanya. */
export async function bumpRev(workspaceId: bigint): Promise<void> {
  const ws = await prisma.workspaces.update({ where: { id: workspaceId }, data: { rev: { increment: 1 } } });
  broadcastSync(Number(workspaceId), { rev: Number(ws.rev), senderId: 0, applied: 0 });
}
