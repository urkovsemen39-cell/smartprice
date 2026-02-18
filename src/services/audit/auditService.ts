import { pool } from '../../config/database';

export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.register'
  | 'user.password_change'
  | 'user.email_verify'
  | 'user.api_key_create'
  | 'user.api_key_revoke'
  | 'favorite.add'
  | 'favorite.remove'
  | 'price_tracking.create'
  | 'price_tracking.delete'
  | 'session.create'
  | 'session.terminate'
  | 'refresh_token.created'
  | 'refresh_token.revoked'
  | 'refresh_token.revoked_all'
  // Ultimate Security Actions
  | 'credential_stuffing_detected'
  | 'account_takeover_suspected'
  | 'bot_activity_detected'
  | 'anomaly_detected'
  | 'account_locked_anomaly'
  | 'ddos_attempt'
  | 'emergency_mode_enabled'
  | 'country_blocked'
  | 'ip_blocked'
  | 'ip_unblocked'
  | 'intrusion_detected'
  | 'jwt_secret_rotated'
  | 'session_secret_rotated'
  | 'database_password_rotated'
  | 'security_alert_created'
  | 'security_incident_created'
  | 'security_incident_updated'
  | 'security_alert_acknowledged'
  | 'security_alert_resolved'
  | 'vulnerability_scan';

interface AuditLogEntry {
  userId?: number | null;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: any;
}

class AuditService {
  // Логирование события
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO audit_log 
         (user_id, action, resource_type, resource_id, ip_address, user_agent, details) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          entry.userId || null,
          entry.action,
          entry.resourceType || null,
          entry.resourceId || null,
          entry.ipAddress || null,
          entry.userAgent || null,
          entry.details ? JSON.stringify(entry.details) : null,
        ]
      );

      const logger = require('../../utils/logger').default;
      logger.info(`Audit log: ${entry.action} by user ${entry.userId || 'anonymous'}`);
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error logging audit entry:', error);
      // Не бросаем ошибку, чтобы не прерывать основной процесс
    }
  }

  // Получение логов пользователя (с пагинацией)
  async getUserLogs(userId: number, limit: number = 50, offset: number = 0): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM audit_log 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return result.rows;
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error getting user logs:', error);
      return [];
    }
  }

  // Получение количества логов пользователя
  async getUserLogsCount(userId: number): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM audit_log WHERE user_id = $1`,
        [userId]
      );

      return parseInt(result.rows[0].count);
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error getting user logs count:', error);
      return 0;
    }
  }

  // Получение логов по действию
  async getLogsByAction(action: AuditAction, limit: number = 100): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM audit_log 
         WHERE action = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [action, limit]
      );

      return result.rows;
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error getting logs by action:', error);
      return [];
    }
  }

  // Получение подозрительной активности
  async getSuspiciousActivity(hours: number = 24): Promise<any[]> {
    try {
      // Подозрительная активность: много неудачных попыток входа
      const result = await pool.query(
        `SELECT 
           ip_address,
           COUNT(*) as attempt_count,
           MAX(created_at) as last_attempt
         FROM audit_log 
         WHERE action = 'user.login' 
           AND created_at > NOW() - INTERVAL '${hours} hours'
           AND details->>'success' = 'false'
         GROUP BY ip_address
         HAVING COUNT(*) > 5
         ORDER BY attempt_count DESC`,
        []
      );

      return result.rows;
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error getting suspicious activity:', error);
      return [];
    }
  }

  // Статистика безопасности
  async getSecurityStats(days: number = 7): Promise<any> {
    try {
      const stats = await pool.query(
        `SELECT 
           action,
           COUNT(*) as count,
           COUNT(DISTINCT user_id) as unique_users,
           COUNT(DISTINCT ip_address) as unique_ips
         FROM audit_log 
         WHERE created_at > NOW() - INTERVAL '${days} days'
         GROUP BY action
         ORDER BY count DESC`,
        []
      );

      const failedLogins = await pool.query(
        `SELECT COUNT(*) as count
         FROM audit_log 
         WHERE action = 'user.login' 
           AND created_at > NOW() - INTERVAL '${days} days'
           AND details->>'success' = 'false'`,
        []
      );

      return {
        actionStats: stats.rows,
        failedLoginCount: parseInt(failedLogins.rows[0]?.count || '0'),
        period: `${days} days`,
      };
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error getting security stats:', error);
      return null;
    }
  }

  // Экспорт логов в JSON
  async exportLogs(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM audit_log 
         WHERE created_at BETWEEN $1 AND $2 
         ORDER BY created_at DESC`,
        [startDate, endDate]
      );

      return result.rows;
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error exporting logs:', error);
      return [];
    }
  }
}

export const auditService = new AuditService();
