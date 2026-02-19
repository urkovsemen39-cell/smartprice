/**
 * Owner API Routes
 * Эндпоинты для скрытой админ-панели владельца
 */

import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { ownerModeService } from '../../services/owner/ownerModeService';
import { pool } from '../../config/database';
import redisClient from '../../config/redis';
import { databaseMonitoringService } from '../../services/monitoring/databaseMonitoringService';
import { advancedCacheService } from '../../services/cache/advancedCacheService';
import { queueService } from '../../services/queue/queueService';
import { backupService } from '../../services/backup/backupService';
import logger from '../../utils/logger';
import { HTTP_STATUS } from '../../config/constants';

const router = Router();

// Middleware для проверки Owner Mode
async function requireOwnerMode(req: AuthRequest, res: Response, next: Function) {
  const sessionId = req.headers['x-owner-session'] as string;

  if (!sessionId) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Owner session required' });
  }

  const session = await ownerModeService.validateOwnerSession(sessionId);
  if (!session) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid or expired owner session' });
  }

  (req as any).ownerSession = session;
  next();
}

router.use(authMiddleware);

/**
 * Активация Owner Mode
 * POST /api/owner/activate
 */
router.post('/activate', async (req: AuthRequest, res: Response) => {
  try {
    const { totpCode, deviceFingerprint } = req.body;
    const userId = req.userId!;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    logger.info(`Owner activation attempt: userId=${userId}, totpCode=${totpCode?.length} digits`);

    const result = await ownerModeService.activateOwnerMode(
      userId,
      totpCode,
      ipAddress,
      userAgent,
      deviceFingerprint
    );

    if (!result.success) {
      logger.warn(`Owner activation failed: ${result.error}`);
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: result.error });
    }

    res.json({
      success: true,
      sessionId: result.sessionId,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    logger.error('Error activating owner mode:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
      error: 'Failed to activate owner mode',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Деактивация Owner Mode
 * POST /api/owner/deactivate
 */
router.post('/deactivate', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = req.headers['x-owner-session'] as string;
    await ownerModeService.deactivateOwnerMode(sessionId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deactivating owner mode:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to deactivate owner mode' });
  }
});

/**
 * Dashboard - общая статистика
 * GET /api/owner/dashboard
 */
router.get('/dashboard', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    // Статистика пользователей
    const usersStats = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE email_verified = true) as verified_users,
        COUNT(*) FILTER (WHERE account_locked = true) as locked_users,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as new_users_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_users_7d
      FROM users
    `);

    // Статистика активности
    const activityStats = await pool.query(`
      SELECT 
        COUNT(*) as total_searches,
        COUNT(DISTINCT user_id) as active_users,
        COUNT(*) FILTER (WHERE searched_at > NOW() - INTERVAL '24 hours') as searches_24h
      FROM search_history
      WHERE searched_at > NOW() - INTERVAL '7 days'
    `);

    // Статистика безопасности
    const securityStats = await pool.query(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_events,
        COUNT(*) FILTER (WHERE severity = 'high') as high_events,
        COUNT(*) FILTER (WHERE resolved = false) as unresolved_events
      FROM security_events
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    // Статистика системы
    const dbStats = await databaseMonitoringService.getConnectionStats();
    const cacheStats = advancedCacheService.getL1Stats();

    res.json({
      users: usersStats.rows[0],
      activity: activityStats.rows[0],
      security: securityStats.rows[0],
      system: {
        database: dbStats,
        cache: cacheStats,
      },
    });
  } catch (error) {
    logger.error('Error getting dashboard data:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get dashboard data' });
  }
});

/**
 * Управление пользователями - список
 * GET /api/owner/users
 */
router.get('/users', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = 'SELECT id, email, name, role, email_verified, account_locked, created_at FROM users WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (email ILIKE $${paramIndex} OR name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (role) {
      query += ` AND role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    if (status === 'locked') {
      query += ' AND account_locked = true';
    } else if (status === 'verified') {
      query += ' AND email_verified = true';
    } else if (status === 'unverified') {
      query += ' AND email_verified = false';
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    // Получение общего количества
    const countQuery = query.split('ORDER BY')[0].replace('SELECT id, email, name, role, email_verified, account_locked, created_at', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params.slice(0, -2));

    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    logger.error('Error getting users:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get users' });
  }
});

/**
 * Детали пользователя
 * GET /api/owner/users/:id
 */
router.get('/users/:id', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    // Основная информация
    const userResult = await pool.query(
      'SELECT id, email, name, role, email_verified, account_locked, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'User not found' });
    }

    // Статистика активности
    const activityResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM search_history WHERE user_id = $1) as total_searches,
        (SELECT COUNT(*) FROM favorites WHERE user_id = $1) as total_favorites,
        (SELECT COUNT(*) FROM price_tracking WHERE user_id = $1) as total_alerts,
        (SELECT MAX(searched_at) FROM search_history WHERE user_id = $1) as last_search
    `, [userId]);

    // Последние действия
    const recentActions = await pool.query(
      'SELECT action, resource, created_at FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      [userId]
    );

    // Security events
    const securityEvents = await pool.query(
      'SELECT event_type, severity, created_at FROM security_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      [userId]
    );

    res.json({
      user: userResult.rows[0],
      activity: activityResult.rows[0],
      recentActions: recentActions.rows,
      securityEvents: securityEvents.rows,
    });
  } catch (error) {
    logger.error('Error getting user details:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get user details' });
  }
});

/**
 * Блокировка/разблокировка пользователя
 * POST /api/owner/users/:id/lock
 */
router.post('/users/:id/lock', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const { locked, reason } = req.body;

    await pool.query(
      'UPDATE users SET account_locked = $1, locked_at = $2, lock_reason = $3 WHERE id = $4',
      [locked, locked ? new Date() : null, locked ? reason : null, userId]
    );

    // Логирование
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, resource, resource_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.userId,
        locked ? 'USER_LOCKED' : 'USER_UNLOCKED',
        'user',
        userId.toString(),
        JSON.stringify({ reason }),
      ]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error locking/unlocking user:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to update user status' });
  }
});

/**
 * Изменение роли пользователя
 * POST /api/owner/users/:id/role
 */
router.post('/users/:id/role', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const { role } = req.body;

    if (!['user', 'moderator', 'admin'].includes(role)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid role' });
    }

    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);

    // Логирование
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, resource, resource_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.userId, 'USER_ROLE_CHANGED', 'user', userId.toString(), JSON.stringify({ newRole: role })]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error changing user role:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to change user role' });
  }
});

/**
 * Security Events
 * GET /api/owner/security/events
 */
router.get('/security/events', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 50, severity, resolved } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = 'SELECT * FROM security_events WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (severity) {
      query += ` AND severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }

    if (resolved !== undefined) {
      query += ` AND resolved = $${paramIndex}`;
      params.push(resolved === 'true');
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      events: result.rows,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    logger.error('Error getting security events:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get security events' });
  }
});

/**
 * Разрешение security event
 * POST /api/owner/security/events/:id/resolve
 */
router.post('/security/events/:id/resolve', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const eventId = parseInt(req.params.id);

    await pool.query(
      'UPDATE security_events SET resolved = true, resolved_at = NOW() WHERE id = $1',
      [eventId]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error resolving security event:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to resolve event' });
  }
});

/**
 * IP Blocks - список
 * GET /api/owner/security/ip-blocks
 */
router.get('/security/ip-blocks', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT * FROM ip_blocks 
      WHERE permanent = true OR blocked_until > NOW()
      ORDER BY created_at DESC
    `);

    res.json({ blocks: result.rows });
  } catch (error) {
    logger.error('Error getting IP blocks:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get IP blocks' });
  }
});

/**
 * Разблокировка IP
 * DELETE /api/owner/security/ip-blocks/:ip
 */
router.delete('/security/ip-blocks/:ip', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const ipAddress = req.params.ip;

    await pool.query('DELETE FROM ip_blocks WHERE ip_address = $1', [ipAddress]);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error unblocking IP:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to unblock IP' });
  }
});

/**
 * System Metrics
 * GET /api/owner/system/metrics
 */
router.get('/system/metrics', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const dbStats = await databaseMonitoringService.getConnectionStats();
    const slowQueries = await databaseMonitoringService.getSlowQueries(10);
    const cacheStats = advancedCacheService.getL1Stats();

    // Redis info
    let redisInfo: any = {};
    try {
      const info = await redisClient.info();
      redisInfo = {
        connected: true,
        info: info.split('\n').slice(0, 20).join('\n'),
      };
    } catch (error) {
      redisInfo = { connected: false };
    }

    res.json({
      database: {
        ...dbStats,
        slowQueries,
      },
      cache: cacheStats,
      redis: redisInfo,
    });
  } catch (error) {
    logger.error('Error getting system metrics:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get system metrics' });
  }
});

/**
 * Cache Management - очистка
 * POST /api/owner/cache/clear
 */
router.post('/cache/clear', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const { pattern } = req.body;

    if (pattern) {
      await advancedCacheService.deletePattern(pattern);
    } else {
      await advancedCacheService.flush();
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to clear cache' });
  }
});

/**
 * Audit Logs
 * GET /api/owner/audit/logs
 */
router.get('/audit/logs', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 50, userId, action } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND user_id = $${paramIndex}`;
      params.push(Number(userId));
      paramIndex++;
    }

    if (action) {
      query += ` AND action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      logs: result.rows,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    logger.error('Error getting audit logs:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get audit logs' });
  }
});

/**
 * Real-time Stats
 * GET /api/owner/realtime/stats
 */
router.get('/realtime/stats', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    // Активные пользователи (последние 5 минут)
    const activeUsers = await pool.query(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM search_history
      WHERE searched_at > NOW() - INTERVAL '5 minutes'
    `);

    // Последние поиски
    const recentSearches = await pool.query(`
      SELECT query, searched_at, user_id
      FROM search_history
      ORDER BY searched_at DESC
      LIMIT 10
    `);

    // Последние регистрации
    const recentRegistrations = await pool.query(`
      SELECT email, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 5
    `);

    res.json({
      activeUsers: activeUsers.rows[0].count,
      recentSearches: recentSearches.rows,
      recentRegistrations: recentRegistrations.rows,
    });
  } catch (error) {
    logger.error('Error getting realtime stats:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to get realtime stats' });
  }
});

/**
 * Backup Management
 * GET /api/owner/backup/list
 */
router.get('/backup/list', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const backups = await backupService.listBackups();
    const stats = await backupService.getBackupStats();

    res.json({
      backups,
      stats,
    });
  } catch (error) {
    logger.error('Error listing backups:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to list backups' });
  }
});

/**
 * Create Full Backup
 * POST /api/owner/backup/create
 */
router.post('/backup/create', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Запуск бэкапа в фоне
    backupService.createFullBackup(userId).then(result => {
      if (result.success) {
        logger.info(`Backup completed: ${result.backupId}`);
      } else {
        logger.error(`Backup failed: ${result.error}`);
      }
    });

    res.json({
      success: true,
      message: 'Backup started in background',
    });
  } catch (error) {
    logger.error('Error starting backup:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to start backup' });
  }
});

/**
 * Download Backup
 * GET /api/owner/backup/download/:backupId
 */
router.get('/backup/download/:backupId', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const { backupId } = req.params;
    const backupPath = await backupService.getBackupPath(backupId);

    if (!backupPath) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Backup not found' });
    }

    res.download(backupPath);
  } catch (error) {
    logger.error('Error downloading backup:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to download backup' });
  }
});

/**
 * Delete Backup
 * DELETE /api/owner/backup/:backupId
 */
router.delete('/backup/:backupId', requireOwnerMode, async (req: AuthRequest, res: Response) => {
  try {
    const { backupId } = req.params;
    const success = await backupService.deleteBackup(backupId);

    if (!success) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Backup not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting backup:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to delete backup' });
  }
});

export default router;
