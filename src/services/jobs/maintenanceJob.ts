/**
 * Maintenance Job
 * Периодические задачи обслуживания системы
 */

import { refreshTokenService } from '../auth/refreshTokenService';
import { sessionService } from '../auth/sessionService';
import { queueService } from '../queue/queueService';
import anomalyDetectionService from '../security/anomalyDetectionService';
import secretsManagementService from '../security/secretsManagementService';
import metricsService from '../monitoring/metricsService';
import { MONITORING } from '../../config/constants';
import logger from '../../utils/logger';

class MaintenanceJob {
  private intervals: NodeJS.Timeout[] = [];

  /**
   * Запуск всех периодических задач
   */
  start(): void {
    logger.info('Starting maintenance jobs...');

    // Очистка истекших refresh tokens (каждый час)
    this.intervals.push(
      setInterval(async () => {
        try {
          await refreshTokenService.cleanupExpiredTokens();
        } catch (error) {
          logger.error('Error cleaning refresh tokens:', error);
        }
      }, MONITORING.SESSION_CLEANUP_INTERVAL)
    );

    // Очистка истекших сессий (каждый час)
    this.intervals.push(
      setInterval(async () => {
        try {
          await sessionService.cleanupExpiredSessions();
        } catch (error) {
          logger.error('Error cleaning sessions:', error);
        }
      }, MONITORING.SESSION_CLEANUP_INTERVAL)
    );

    // Очистка очередей (раз в сутки)
    this.intervals.push(
      setInterval(async () => {
        try {
          await queueService.cleanQueues();
        } catch (error) {
          logger.error('Error cleaning queues:', error);
        }
      }, MONITORING.QUEUE_CLEANUP_INTERVAL)
    );

    // Очистка старых метрик (каждый час)
    this.intervals.push(
      setInterval(() => {
        try {
          metricsService.cleanup();
        } catch (error) {
          logger.error('Error cleaning metrics:', error);
        }
      }, MONITORING.METRICS_CLEANUP_INTERVAL)
    );

    // Обновление профилей пользователей для anomaly detection (раз в сутки)
    this.intervals.push(
      setInterval(async () => {
        try {
          logger.info('Updating user behavior profiles...');
          await anomalyDetectionService.updateAllProfiles();
          logger.info('User behavior profiles updated');
        } catch (error) {
          logger.error('Error updating profiles:', error);
        }
      }, MONITORING.PROFILE_UPDATE_INTERVAL)
    );

    // Проверка необходимости ротации секретов (раз в неделю)
    this.intervals.push(
      setInterval(async () => {
        try {
          const secretTypes = ['jwt_secret', 'session_secret'];
          
          for (const secretType of secretTypes) {
            const needsRotation = await secretsManagementService.checkRotationNeeded(secretType);
            if (needsRotation) {
              logger.warn(`${secretType} rotation needed!`);
              // Отправка уведомления администраторам
            }
          }
        } catch (error) {
          logger.error('Error checking secret rotation:', error);
        }
      }, 7 * 24 * 60 * 60 * 1000) // Раз в неделю
    );

    logger.info('Maintenance jobs started');
  }

  /**
   * Остановка всех периодических задач
   */
  stop(): void {
    logger.warn('Stopping maintenance jobs...');
    
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    
    logger.info('Maintenance jobs stopped');
  }

  /**
   * Ручной запуск всех задач обслуживания
   */
  async runAll(): Promise<void> {
    logger.info('Running all maintenance tasks...');

    try {
      await Promise.all([
        refreshTokenService.cleanupExpiredTokens(),
        sessionService.cleanupExpiredSessions(),
        queueService.cleanQueues(),
      ]);

      metricsService.cleanup();

      logger.info('All maintenance tasks completed');
    } catch (error) {
      logger.error('Error running maintenance tasks:', error);
      throw error;
    }
  }
}

export const maintenanceJob = new MaintenanceJob();
export default maintenanceJob;
