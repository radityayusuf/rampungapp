import { Request } from 'express';
import { users, workspaces } from '@prisma/client';

export type UserRole = 'owner' | 'admin' | 'member';

export interface AuthenticatedUser extends users {
  workspace?: workspaces | null;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
  tokenHash?: string;
}
