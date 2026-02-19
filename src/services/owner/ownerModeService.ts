/**
 * Owner Mode Service
 * Управление режимом владельца с временными токенами
 */

import crypto from 'crypto';
import { pool } from '../../config/database';
import redisClient from '../../config/redis';
import logger from '../../utils/logger';
import speakeasy from 'speakeasy';

interface OwnerSession {
  sessionId: string;
  userId: number;
  activatedAt: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: string;
}

class OwnerModeService {
  private readonly SESSION_DURATION = 6 * 60 * 60 * 1000; // 6 hours
  private readonly REDIS_PREFIX = 'owner_session:';

  /**
   * Проверка является ли пользователь владельцем
   */
  async isOwner(userId: number): Promise<boolean> {
    try {
      const result = await pool.query(
        'SELECT role FROM users WHERE id = $1',
        [userId]
      );

      return result.rows[0]?.role === 'owner';
    } catch (error) {
      logger.error('Error checking owner status:', error);
      return false;
    }
  }

  /**
   * Активация Owner Mode с TOTP
   */
  async activateOwnerMode(
    userId: number,
    totpCode: string,
    ipAddress: string,
    userAgent: string,
    deviceFingerprint: string
  ): Promise<{ success: boolean; sessionId?: string; expiresAt?: Date; error?: string }> {
    try {
      logger.info(`[OwnerMode] Step 1: Checking if user ${userId} is owner`);
      
      // Проверка что пользователь - владелец
      const isOwner = await this.isOwner(userId);
      if (!isOwner) {
        logger.warn(`Non-owner user ${userId} attempted to activate owner mode`);
        return { success: false, error: 'Access denied' };
      }

      logger.info(`[OwnerMode] Step 2: Getting TOTP secret for user ${userId}`);
      
      // Получение TOTP секрета
      const totpResult = await pool.query(
        'SELECT secret FROM two_factor_auth WHERE user_id = $1 AND enabled = true',
        [userId]
      );

      if (totpResult.rows.length === 0) {
        logger.warn(`[OwnerMode] No 2FA found for user ${userId}`);
        return { success: false, error: '2FA not enabled' };
      }

      logger.info(`[OwnerMode] Step 3: Verifying TOTP code`);
      
      // Проверка TOTP кода
      const secret = totpResult.rows[0].secret;
      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: totpCode,
        window: 2,
      });

      if (!verified) {
        logger.warn(`Invalid TOTP code for owner user ${userId}`);
        return { success: false, error: 'Invalid TOTP code' };
      }

      logger.info(`[OwnerMode] Step 4: Creating session`);
      
      // Создание сессии
      const sessionId = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + this.SESSION_DURATION);

      const session: OwnerSession = {
        sessionId,
        userId,
        activatedAt: new Date(),
        expiresAt,
        ipAddress,
        userAgent,
        deviceFingerprint,
      };

      logger.info(`[OwnerMode] Step 5: Saving to Redis`);
      
      // Сохранение в Redis
      try {
        await redisClient.setEx(
          `${this.REDIS_PREFIX}${sessionId}`,
          this.SESSION_DURATION / 1000,
          JSON.stringify(session)
        );
      } catch (redisError) {
        logger.error(`[OwnerMode] Redis error:`, redisError);
        return { success: false, error: 'Failed to create session' };
      }

      logger.info(`[OwnerMode] Step 6: Logging to audit_logs`);
      
      // Логирование активации
      try {
        await pool.query(
          `INSERT INTO audit_logs (user_id, action, resource, details, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            userId,
            'OWNER_MODE_ACTIVATED',
            'owner_mode',
            JSON.stringify({ sessionId, expiresAt }),
            ipAddress,
            userAgent,
          ]
        );
      } catch (auditError) {
        logger.error(`[OwnerMode] Audit log error:`, auditError);
        // Не критично, продолжаем
      }

      logger.info(`Owner mode activated for user ${userId}, session: ${sessionId}`);

      return { success: true, sessionId, expiresAt };
    } catch (error) {
      logger.error('Error activating owner mode:', error);
      return { success: false, error: 'Internal error' };
    }
  }

  /**
   * Проверка активной Owner сессии
   */
  async validateOwnerSession(sessionId: string): Promise<OwnerSession | null> {
    try {
      const sessionData = await redisClient.get(`${this.REDIS_PREFIX}${sessionId}`);
      
      if (!sessionData) {
        return null;
      }

      const session: OwnerSession = JSON.parse(sessionData);

      // Проверка срока действия
      if (new Date() > new Date(session.expiresAt)) {
        await this.deactivateOwnerMode(sessionId);
        return null;
      }

      return session;
    } catch (error) {
      logger.error('Error validating owner session:', error);
      return null;
    }
  }

  /**
   * Деактивация Owner Mode
   */
  async deactivateOwnerMode(sessionId: string): Promise<void> {
    try {
      const sessionData = await redisClient.get(`${this.REDIS_PREFIX}${sessionId}`);
      
      if (sessionData) {
        const session: OwnerSession = JSON.parse(sessionData);
        
        // Логирование деактивации
        await pool.query(
          `INSERT INTO audit_logs (user_id, action, resource, details)
           VALUES ($1, $2, $3, $4)`,
          [
            session.userId,
            'OWNER_MODE_DEACTIVATED',
            'owner_mode',
            JSON.stringify({ sessionId }),
          ]
        );
      }

      await redisClient.del(`${this.REDIS_PREFIX}${sessionId}`);
      logger.info(`Owner mode deactivated, session: ${sessionId}`);
    } catch (error) {
      logger.error('Error deactivating owner mode:', error);
    }
  }

  /**
   * Получение всех активных Owner сессий
   */
  async getActiveSessions(userId: number): Promise<OwnerSession[]> {
    try {
      const keys = await redisClient.keys(`${this.REDIS_PREFIX}*`);
      const sessions: OwnerSession[] = [];

      for (const key of keys) {
        const sessionData = await redisClient.get(key);
        if (sessionData) {
          const session: OwnerSession = JSON.parse(sessionData);
          if (session.userId === userId) {
            sessions.push(session);
          }
        }
      }

      return sessions;
    } catch (error) {
      logger.error('Error getting active sessions:', error);
      return [];
    }
  }

  /**
   * Продление сессии
   */
  async extendSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.validateOwnerSession(sessionId);
      if (!session) {
        return false;
      }

      const newExpiresAt = new Date(Date.now() + this.SESSION_DURATION);
      session.expiresAt = newExpiresAt;

      await redisClient.setEx(
        `${this.REDIS_PREFIX}${sessionId}`,
        this.SESSION_DURATION / 1000,
        JSON.stringify(session)
      );

      return true;
    } catch (error) {
      logger.error('Error extending session:', error);
      return false;
    }
  }
}

export const ownerModeService = new OwnerModeService();
export default ownerModeService;
