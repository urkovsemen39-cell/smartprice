import { Router, Request, Response } from 'express';
import { auditService } from '../../services/audit/auditService';
import { databaseMonitoringService } from '../../services/monitoring/databaseMonitoringService';
import { queueService } from '../../services/queue/queueService';
import { advancedCacheService } from '../../services/cache/advancedCacheService';
import { authenticateToken, requireAdmin } from '../../middleware/auth';
import { asyncHandler } from '../../utils/errors';

const router = Router();

// Все admin routes требуют аутентификации и роли admin
router.use(authenticateToken);
router.use(requireAdmin);

// === AUDIT ENDPOINTS ===

router.get('/audit/user/:userId', asyncHandler(async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId);
  const limit = parseInt(req.query.limit as string) || 50;

  const logs = await auditService.getUserLogs(userId, limit);
  res.json({ logs });
}));

router.get('/audit/suspicious', asyncHandler(async (req: Request, res: Response) => {
  const hours = parseInt(req.query.hours as string) || 24;
  const activity = await auditService.getSuspiciousActivity(hours);
  res.json({ activity });
}));

router.get('/audit/stats', asyncHandler(async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 7;
  const stats = await auditService.getSecurityStats(days);
  res.json({ stats });
}));

// === DATABASE MONITORING ENDPOINTS ===

router.get('/monitoring/database', asyncHandler(async (req: Request, res: Response) => {
  const report = await databaseMonitoringService.getFullReport();
  res.json({ report });
}));

router.get('/monitoring/slow-queries', asyncHandler(async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const queries = await databaseMonitoringService.getSlowQueries(limit);
  res.json({ queries });
}));

router.get('/monitoring/tables', asyncHandler(async (req: Request, res: Response) => {
  const stats = await databaseMonitoringService.getTableStats();
  res.json({ stats });
}));

router.get('/monitoring/unused-indexes', asyncHandler(async (req: Request, res: Response) => {
  const indexes = await databaseMonitoringService.getUnusedIndexes();
  res.json({ indexes });
}));

// === QUEUE MONITORING ENDPOINTS ===

router.get('/monitoring/queues', asyncHandler(async (req: Request, res: Response) => {
  const stats = await queueService.getQueueStats();
  res.json({ stats });
}));

// === CACHE MONITORING ENDPOINTS ===

router.get('/monitoring/cache', asyncHandler(async (req: Request, res: Response) => {
  const l1Stats = advancedCacheService.getL1Stats();
  res.json({ l1: l1Stats });
}));

router.post('/monitoring/cache/flush', asyncHandler(async (req: Request, res: Response) => {
  await advancedCacheService.flush();
  res.json({ success: true, message: 'Cache flushed' });
}));

export default router;
