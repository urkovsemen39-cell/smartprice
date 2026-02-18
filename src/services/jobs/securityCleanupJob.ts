/**
 * Security Cleanup Job
 * Автоматическая очистка старых данных безопасности
 */

import { pool } from '../../config/database';
import { redisClient } from '../../config/redis';
import logger from '../../utils/logger';

class SecurityCleanupJob {
  private intervalId: NodeJS.Timeout | null = null;

  /**
   * Запуск задачи очистки
   */
  start(intervalHours: number = 24): void {
    if (this.intervalId) {
      logger.warn('Security cleanup job already running');
      return;
    }

    logger.info(`Starting security cleanup job (every ${intervalHours} hours)`);

    // Запуск сразу
    this.runCleanup();

    // Запуск по расписанию
    this.intervalId = setInterval(
      () => this.runCleanup(),
      intervalHours * 60 * 60 * 1000
    );
  }

  /**
   * Остановка задачи
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Security cleanup job stopped');
    }
  }

  /**
   * Выполнение очистки
   */
  private async runCleanup(): Promise<void> {
    logger.info('Running security cleanup...');

    try {
      // Очистка старых попыток взлома (> 90 дней)
      const intrusionResult = await pool.query(
        `DELETE FROM intrusion_attempts WHERE created_at < NOW() - INTERVAL '90 days'`
      );
      logger.info(`  ✓ Cleaned ${intrusionResult.rowCount} old intrusion attempts`);

      // Очистка старых аномалий (> 90 дней)
      const anomalyResult = await pool.query(
        `DELETE FROM anomaly_detections WHERE detected_at < NOW() - INTERVAL '90 days'`
      );
      logger.info(`  ✓ Cleaned ${anomalyResult.rowCount} old anomaly detections`);

      // Очистка старых WAF блокировок (> 90 дней)
      const wafResult = await pool.query(
        `DELETE FROM waf_blocks WHERE blocked_at < NOW() - INTERVAL '90 days'`
      );
      logger.info(`  ✓ Cleaned ${wafResult.rowCount} old WAF blocks`);

      // Очистка старых логов аудита (> 180 дней)
      const auditResult = await pool.query(
        `DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '180 days'`
      );
      logger.info(`  ✓ Cleaned ${auditResult.rowCount} old audit logs`);

      // Очистка старых попыток входа (> 30 дней)
      const loginResult = await pool.query(
        `DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '30 days'`
      );
      logger.info(`  ✓ Cleaned ${loginResult.rowCount} old login attempts`);

      // Очистка старых CSP нарушений (> 30 дней)
      const cspResult = await pool.query(
        `DELETE FROM csp_violations WHERE created_at < NOW() - INTERVAL '30 days'`
      );
      logger.info(`  ✓ Cleaned ${cspResult.rowCount} old CSP violations`);

      // Очистка старых rate limit нарушений (> 7 дней)
      const rateLimitResult = await pool.query(
        `DELETE FROM rate_limit_violations WHERE last_violation < NOW() - INTERVAL '7 days'`
      );
      logger.info(`  ✓ Cleaned ${rateLimitResult.rowCount} old rate limit violations`);

      // Очистка истекших refresh tokens
      const refreshTokenResult = await pool.query(
        `DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked = true`
      );
      logger.info(`  ✓ Cleaned ${refreshTokenResult.rowCount} expired/revoked refresh tokens`);

      // Очистка истекших email верификаций
      const emailVerifResult = await pool.query(
        `DELETE FROM email_verifications WHERE expires_at < NOW() AND verified = false`
      );
      logger.info(`  ✓ Cleaned ${emailVerifResult.rowCount} expired email verifications`);

      // Очистка неактивных сессий (> 30 дней)
      const sessionResult = await pool.query(
        `DELETE FROM user_sessions WHERE last_activity < NOW() - INTERVAL '30 days'`
      );
      logger.info(`  ✓ Cleaned ${sessionResult.rowCount} inactive sessions`);

      // Очистка Redis: старые блокировки IP
      const blockedIPs = await redisClient.keys('blocked_ip:*');
      let expiredBlocks = 0;
      for (const key of blockedIPs) {
        const ttl = await redisClient.ttl(key);
        if (ttl === -1) {
          await redisClient.del(key);
          expiredBlocks++;
        }
      }
      logger.info(`  ✓ Cleaned ${expiredBlocks} expired IP blocks from Redis`);

      // Очистка Redis: старые rate limit ключи
      const rateLimitKeys = await redisClient.keys('rate_limit:*');
      let expiredRateLimits = 0;
      for (const key of rateLimitKeys) {
        const ttl = await redisClient.ttl(key);
        if (ttl === -1) {
          await redisClient.del(key);
          expiredRateLimits++;
        }
      }
      logger.info(`  ✓ Cleaned ${expiredRateLimits} expired rate limit keys from Redis`);

      // VACUUM для оптимизации таблиц (PostgreSQL)
      await pool.query('VACUUM ANALYZE intrusion_attempts');
      await pool.query('VACUUM ANALYZE anomaly_detections');
      await pool.query('VACUUM ANALYZE waf_blocks');
      await pool.query('VACUUM ANALYZE audit_log');
      logger.info('  ✓ Database tables optimized');

      logger.info('Security cleanup completed successfully');
    } catch (error) {
      logger.error('Security cleanup failed:', error);
    }
  }

  /**
   * Ручной запуск очистки
   */
  async runManual(): Promise<void> {
    await this.runCleanup();
  }
}

export default new SecurityCleanupJob();
