import { Router, Request, Response } from 'express';
import { auditService } from '../../services/audit/auditService';
import { databaseMonitoringService } from '../../services/monitoring/databaseMonitoringService';
import { queueService } from '../../services/queue/queueService';
import { advancedCacheService } from '../../services/cache/advancedCacheService';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

// Middleware для проверки прав администратора (упрощенная версия)
const requireAdmin = (req: Request, res: Response, next: any) => {
  // TODO: Добавить реальную проверку прав администратора
  // Пока просто проверяем аутентификацию
  next();
};

// === AUDIT ENDPOINTS ===

// Получение логов пользователя
router.get('/audit/user/:userId', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit as string) || 50;

    const logs = await auditService.getUserLogs(userId, limit);
    res.json({ logs });
  } catch (error) {
    console.error('Error getting user logs:', error);
    res.status(500).json({ error: 'Failed to get user logs' });
  }
});

// Получение подозрительной активности
router.get('/audit/suspicious', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const activity = await auditService.getSuspiciousActivity(hours);

    res.json({ activity });
  } catch (error) {
    console.error('Error getting suspicious activity:', error);
    res.status(500).json({ error: 'Failed to get suspicious activity' });
  }
});

// Статистика безопасности
router.get('/audit/stats', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const stats = await auditService.getSecurityStats(days);

    res.json({ stats });
  } catch (error) {
    console.error('Error getting security stats:', error);
    res.status(500).json({ error: 'Failed to get security stats' });
  }
});

// === DATABASE MONITORING ENDPOINTS ===

// Полный отчет о БД
router.get('/monitoring/database', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const report = await databaseMonitoringService.getFullReport();
    res.json({ report });
  } catch (error) {
    console.error('Error getting database report:', error);
    res.status(500).json({ error: 'Failed to get database report' });
  }
});

// Медленные запросы
router.get('/monitoring/slow-queries', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const queries = await databaseMonitoringService.getSlowQueries(limit);

    res.json({ queries });
  } catch (error) {
    console.error('Error getting slow queries:', error);
    res.status(500).json({ error: 'Failed to get slow queries' });
  }
});

// Статистика таблиц
router.get('/monitoring/tables', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await databaseMonitoringService.getTableStats();
    res.json({ stats });
  } catch (error) {
    console.error('Error getting table stats:', error);
    res.status(500).json({ error: 'Failed to get table stats' });
  }
});

// Неиспользуемые индексы
router.get('/monitoring/unused-indexes', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const indexes = await databaseMonitoringService.getUnusedIndexes();
    res.json({ indexes });
  } catch (error) {
    console.error('Error getting unused indexes:', error);
    res.status(500).json({ error: 'Failed to get unused indexes' });
  }
});

// === QUEUE MONITORING ENDPOINTS ===

// Статистика очередей
router.get('/monitoring/queues', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await queueService.getQueueStats();
    res.json({ stats });
  } catch (error) {
    console.error('Error getting queue stats:', error);
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

// === CACHE MONITORING ENDPOINTS ===

// Статистика кэша
router.get('/monitoring/cache', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const l1Stats = advancedCacheService.getL1Stats();
    res.json({ l1: l1Stats });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// Очистка кэша
router.post('/monitoring/cache/flush', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    await advancedCacheService.flush();
    res.json({ success: true, message: 'Cache flushed' });
  } catch (error) {
    console.error('Error flushing cache:', error);
    res.status(500).json({ error: 'Failed to flush cache' });
  }
});

export default router;
