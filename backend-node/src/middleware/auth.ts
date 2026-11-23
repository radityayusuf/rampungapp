import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../db';
import { AuthRequest } from '../types';

export const IDLE_DAYS = 30;

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Sesi tidak valid. Silakan masuk lagi.' });
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json({ message: 'Sesi tidak valid. Silakan masuk lagi.' });
    return;
  }

  const hash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const row = await prisma.api_tokens.findUnique({
      where: { token_hash: hash },
    });

    if (!row) {
      res.status(401).json({ message: 'Sesi tidak valid. Silakan masuk lagi.' });
      return;
    }

    const now = new Date();

    // Check expiration for device session tokens (name is null)
    if (row.name === null) {
      const last = row.last_used_at || row.created_at || now;
      const daysDiff = (now.getTime() - new Date(last).getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > IDLE_DAYS) {
        await prisma.api_tokens.delete({ where: { id: row.id } });
        res.status(401).json({ message: 'Sesi tidak valid. Silakan masuk lagi.' });
        return;
      }
    }

    const user = await prisma.users.findUnique({
      where: { id: row.user_id },
    });

    if (!user || !user.workspace_id) {
      res.status(401).json({ message: 'Sesi tidak valid. Silakan masuk lagi.' });
      return;
    }

    // Throttle last_used_at update to every 5 minutes
    if (!row.last_used_at || (now.getTime() - new Date(row.last_used_at).getTime()) > 5 * 60 * 1000) {
      await prisma.api_tokens.update({
        where: { id: row.id },
        data: { last_used_at: now },
      });
    }

    const workspace = await prisma.workspaces.findUnique({
      where: { id: user.workspace_id },
    });

    req.user = {
      ...user,
      workspace,
    };
    req.tokenHash = hash;

    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ message: 'Terjadi kesalahan pada server auth.' });
  }
}
