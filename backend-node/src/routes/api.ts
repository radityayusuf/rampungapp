import { NextFunction, RequestHandler, Response, Router } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import * as authCtrl from '../controllers/auth';
import * as syncCtrl from '../controllers/sync';
import * as teamCtrl from '../controllers/team';
import * as portalCtrl from '../controllers/portal';
import * as uploadsCtrl from '../controllers/uploads';
import * as avatarCtrl from '../controllers/avatar';
import * as integrationsCtrl from '../controllers/integrations';
import * as systemCtrl from '../controllers/system';
import * as billingCtrl from '../controllers/billing';
import * as adminPayCtrl from '../controllers/adminPayments';
import { publicCatalog } from '../services/planConfig';
import { authIpLimiter, loginAccountLimiter, publicReadLimiter, userLimiter } from '../rateLimit';

export const apiRouter = Router();

/**
 * Express 4 tidak menangkap error pada handler async: tanpa pembungkus ini, satu input rusak
 * membuat promise ditolak tanpa penangan dan (di Node modern) mematikan seluruh proses server.
 * Pembungkus meneruskan error ke penangan error di app.ts (respons 500 JSON).
 */
const wrap =
  (fn: (req: AuthRequest, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req as AuthRequest, res, next)).catch(next);
  };

// ─── Health check (Publik) ───
apiRouter.get('/health', wrap(async (_req, res) => {
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
}));

// ─── Auth (Publik) ───
apiRouter.post('/auth/register', authIpLimiter, wrap(authCtrl.register));
apiRouter.post('/auth/login', authIpLimiter, loginAccountLimiter, wrap(authCtrl.login));
apiRouter.post('/auth/forgot', authIpLimiter, wrap(authCtrl.forgot));
apiRouter.post('/auth/reset', authIpLimiter, wrap(authCtrl.reset));
apiRouter.post('/auth/google', authIpLimiter, wrap(authCtrl.googleAuth));

// ─── Undangan & Portal (Publik) ───
apiRouter.get('/invites/:token', publicReadLimiter, wrap(teamCtrl.showInvite));
apiRouter.get('/portal/:token', publicReadLimiter, wrap(portalCtrl.show));

// ─── Katalog paket (publik: halaman depan & dialog paket) ───
apiRouter.get('/plans', publicReadLimiter, (_req, res) => { res.json(publicCatalog()); });

// ─── File Download (Publik / Token via URL) ───
apiRouter.get('/uploads/:filename', wrap(uploadsCtrl.getFile));
apiRouter.get('/avatars/:file', publicReadLimiter, wrap(avatarCtrl.getAvatar));

// ─── Terautentikasi (Bearer Token) ───
apiRouter.use(wrap(authMiddleware));

// Profil
apiRouter.get('/auth/me', wrap(authCtrl.me));
apiRouter.patch('/auth/me', wrap(authCtrl.updateMe));
apiRouter.post('/auth/logout', wrap(authCtrl.logout));
apiRouter.post('/auth/me/avatar', userLimiter(20), avatarCtrl.avatarMiddleware.single('avatar'), wrap(avatarCtrl.uploadAvatar));
apiRouter.delete('/auth/me/avatar', userLimiter(20), wrap(avatarCtrl.deleteAvatar));

// Sinkronisasi data
apiRouter.get('/sync', wrap(syncCtrl.pull));
apiRouter.get('/sync/rev', wrap(syncCtrl.getRev));
apiRouter.post('/sync', wrap(syncCtrl.push));

// Anggota Tim
apiRouter.get('/members', wrap(teamCtrl.members));
apiRouter.patch('/members/:id', wrap(teamCtrl.updateMember));
apiRouter.delete('/members/:id', wrap(teamCtrl.removeMember));

// Undangan
apiRouter.get('/invites', wrap(teamCtrl.invites));
apiRouter.post('/invites', wrap(teamCtrl.invite));
apiRouter.delete('/invites/:id', wrap(teamCtrl.revokeInvite));

// Token API Pribadi
apiRouter.get('/tokens', wrap(teamCtrl.tokens));
apiRouter.post('/tokens', wrap(teamCtrl.createToken));
apiRouter.delete('/tokens/:id', wrap(teamCtrl.deleteToken));

// Unggah Berkas
apiRouter.post('/upload', uploadsCtrl.uploadMiddleware.single('file'), wrap(uploadsCtrl.uploadFile));

// Integrasi
apiRouter.get('/integrations/status', wrap(integrationsCtrl.getStatus));
apiRouter.post('/integrations/whatsapp/send', userLimiter(20), wrap(integrationsCtrl.sendWhatsApp));
apiRouter.post('/integrations/ai/breakdown', userLimiter(10), wrap(integrationsCtrl.aiBreakdownTask));
apiRouter.post('/integrations/ai/summarize', userLimiter(30), wrap(integrationsCtrl.aiSummarizeProject));
apiRouter.post('/integrations/webhook/send', userLimiter(10), wrap(integrationsCtrl.sendWebhook));

// Paket & penagihan
apiRouter.get('/billing', wrap(billingCtrl.getBilling));
apiRouter.post('/billing/checkout', userLimiter(20), wrap(billingCtrl.checkout));
apiRouter.get('/billing/payments/:orderId', userLimiter(120), wrap(billingCtrl.paymentStatus));
apiRouter.post('/billing/payments/:orderId/proof', userLimiter(20), billingCtrl.proofMiddleware.single('proof'), wrap(billingCtrl.submitProof));
apiRouter.get('/billing/payments/:orderId/proof', userLimiter(60), wrap(billingCtrl.getOwnProof));
apiRouter.post('/billing/payments/:orderId/cancel', userLimiter(20), wrap(billingCtrl.cancelPayment));
apiRouter.post('/billing/trial', userLimiter(10), wrap(billingCtrl.startTrial));

// ─── Panel Admin Sistem (Superadmin) ───
apiRouter.get('/system/stats', wrap(systemCtrl.getSystemStats));
apiRouter.get('/system/workspaces', wrap(systemCtrl.getSystemWorkspaces));
apiRouter.get('/system/users', wrap(systemCtrl.getSystemUsers));
apiRouter.delete('/system/users/:id', wrap(systemCtrl.deleteSystemUser));
apiRouter.patch('/system/users/:id/role', wrap(systemCtrl.updateSystemUserRole));
apiRouter.patch('/system/workspaces/:id/plan', wrap(systemCtrl.setWorkspacePlan));
apiRouter.post('/system/demo-cleanup', userLimiter(10), wrap(systemCtrl.demoCleanup));
apiRouter.get('/system/plans', wrap(adminPayCtrl.getPlans));
apiRouter.put('/system/plans', wrap(adminPayCtrl.putPlans));
apiRouter.get('/system/payment-settings', wrap(adminPayCtrl.getSettings));
apiRouter.put('/system/payment-settings', wrap(adminPayCtrl.putSettings));
apiRouter.put('/system/payment-settings/qris', adminPayCtrl.qrisMiddleware.single('qris'), wrap(adminPayCtrl.putQris));
apiRouter.delete('/system/payment-settings/qris', wrap(adminPayCtrl.deleteQris));
apiRouter.get('/system/payments', wrap(adminPayCtrl.listPayments));
apiRouter.get('/system/payments/export', userLimiter(20), wrap(adminPayCtrl.exportPayments));
apiRouter.get('/system/payments/:id/proof', wrap(adminPayCtrl.paymentProof));
apiRouter.post('/system/payments/:id/approve', userLimiter(60), wrap(adminPayCtrl.approve));
apiRouter.post('/system/payments/:id/reject', userLimiter(60), wrap(adminPayCtrl.reject));
