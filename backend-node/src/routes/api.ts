import { Router } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import * as authCtrl from '../controllers/auth';
import * as syncCtrl from '../controllers/sync';
import * as teamCtrl from '../controllers/team';
import * as portalCtrl from '../controllers/portal';
import * as uploadsCtrl from '../controllers/uploads';
import * as integrationsCtrl from '../controllers/integrations';
import * as systemCtrl from '../controllers/system';

export const apiRouter = Router();

// ─── Health check (Publik) ───
apiRouter.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      app: 'Rampung Node.js API',
      database: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      app: 'Rampung Node.js API',
      database: 'down',
      timestamp: new Date().toISOString(),
    });
  }
});

// ─── Auth (Publik) ───
apiRouter.post('/auth/register', authCtrl.register);
apiRouter.post('/auth/login', authCtrl.login);
apiRouter.post('/auth/forgot', authCtrl.forgot);
apiRouter.post('/auth/reset', authCtrl.reset);
apiRouter.post('/auth/google', authCtrl.googleAuth);

// ─── Undangan & Portal (Publik) ───
apiRouter.get('/invites/:token', teamCtrl.showInvite);
apiRouter.get('/portal/:token', portalCtrl.show);

// ─── File Download (Publik / Token via URL) ───
apiRouter.get('/uploads/:filename', uploadsCtrl.getFile);

// ─── Terautentikasi (Bearer Token) ───
apiRouter.use(authMiddleware as any);

// Profil
apiRouter.get('/auth/me', authCtrl.me);
apiRouter.patch('/auth/me', authCtrl.updateMe);
apiRouter.post('/auth/logout', authCtrl.logout);

// Sinkronisasi data
apiRouter.get('/sync', syncCtrl.pull);
apiRouter.get('/sync/rev', syncCtrl.getRev);
apiRouter.post('/sync', syncCtrl.push);

// Anggota Tim
apiRouter.get('/members', teamCtrl.members);
apiRouter.patch('/members/:id', teamCtrl.updateMember);
apiRouter.delete('/members/:id', teamCtrl.removeMember);

// Undangan
apiRouter.get('/invites', teamCtrl.invites);
apiRouter.post('/invites', teamCtrl.invite);
apiRouter.delete('/invites/:id', teamCtrl.revokeInvite);

// Token API Pribadi
apiRouter.get('/tokens', teamCtrl.tokens);
apiRouter.post('/tokens', teamCtrl.createToken);
apiRouter.delete('/tokens/:id', teamCtrl.deleteToken);

// Unggah Berkas
apiRouter.post('/upload', uploadsCtrl.uploadMiddleware.single('file'), uploadsCtrl.uploadFile);

// Integrasi (QRIS, WhatsApp, AI)
apiRouter.post('/integrations/qris/generate', integrationsCtrl.generateQris);
apiRouter.post('/integrations/qris/verify', integrationsCtrl.verifyQris);
apiRouter.post('/integrations/whatsapp/send', integrationsCtrl.sendWhatsApp);
apiRouter.get('/integrations/whatsapp/status', integrationsCtrl.getWhatsAppStatus);
apiRouter.post('/integrations/ai/breakdown', integrationsCtrl.aiBreakdownTask);
apiRouter.post('/integrations/ai/summarize', integrationsCtrl.aiSummarizeProject);
apiRouter.post('/integrations/webhook/send', integrationsCtrl.sendWebhook);

// ─── Panel Admin Sistem (Superadmin) ───
apiRouter.get('/system/stats', systemCtrl.getSystemStats);
apiRouter.get('/system/workspaces', systemCtrl.getSystemWorkspaces);
apiRouter.get('/system/users', systemCtrl.getSystemUsers);
apiRouter.delete('/system/users/:id', systemCtrl.deleteSystemUser);
apiRouter.patch('/system/users/:id/role', systemCtrl.updateSystemUserRole);
