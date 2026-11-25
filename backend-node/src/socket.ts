import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import { prisma } from './db';

let io: Server | null = null;

export function initSocket(server: HttpServer, allowedOrigins: string[]): Server {
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token || typeof token !== 'string') {
        return next(new Error('Authentication error: Token required'));
      }

      const hash = crypto.createHash('sha256').update(token.trim()).digest('hex');
      const apiToken = await prisma.api_tokens.findUnique({
        where: { token_hash: hash },
      });

      if (!apiToken) {
        return next(new Error('Authentication error: Invalid token'));
      }

      const user = await prisma.users.findUnique({
        where: { id: apiToken.user_id },
      });

      if (!user || !user.workspace_id) {
        return next(new Error('Authentication error: User or workspace not found'));
      }

      socket.data.userId = Number(user.id);
      socket.data.workspaceId = Number(user.workspace_id);
      socket.data.name = user.name;

      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const wsId = socket.data.workspaceId;
    const room = `workspace_${wsId}`;
    socket.join(room);

    console.log(`[SOCKET] User ${socket.data.name} (${socket.data.userId}) joined ${room}`);

    // Notify others in room
    socket.to(room).emit('user:online', {
      userId: socket.data.userId,
      name: socket.data.name,
    });

    socket.on('disconnect', () => {
      socket.to(room).emit('user:offline', {
        userId: socket.data.userId,
      });
      console.log(`[SOCKET] User ${socket.data.name} disconnected`);
    });
  });

  return io;
}

/** Jumlah klien WebSocket yang sedang terhubung, atau null bila Socket.io belum dijalankan. */
export function connectedClients(): number | null {
  return io ? io.engine.clientsCount : null;
}

export function broadcastSync(workspaceId: number, data: { rev: number; senderId: number; applied: number }): void {
  if (!io) return;
  const room = `workspace_${workspaceId}`;
  io.to(room).emit('sync:update', data);
  console.log(`[SOCKET] Broadcasted sync:update to ${room} (rev ${data.rev})`);
}

export function broadcastNotification(workspaceId: number, notification: any): void {
  if (!io) return;
  const room = `workspace_${workspaceId}`;
  io.to(room).emit('notification:new', notification);
}
