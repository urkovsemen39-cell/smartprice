/**
 * Refresh Token Service
 * Управление refresh tokens для безопасной аутентификации
 */

import crypto from 'crypto';
import { pool } from '../../config/database';
import { redisClient } from '../../config/redis';
import { AUTH } from '../../config/constants';
import { auditService } from '../audit/auditService';
import logger from '../../utils/logger';

interface RefreshToken {
  id: number;
  userId: number;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

class RefreshTokenService {
  /**
   * Генерация refresh token
   * SECURITY: Токены хранятся как SHA-256 хеш для защиты от компрометации БД
   */
  async generateRefreshToken(userId: number, ip?: string, userAgent?: string): Promise<string> {
    // Генерируем криптографически стойкий токен
    const token = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(token);
    
    // Срок действия 7 дней
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Сохраняем ТОЛЬКО ХЕШ в БД (не сам токен!)
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, tokenHash, expiresAt, ip || null, userAgent || null]
    );

    // Логируем создание токена
    await auditService.log({
      userId,
      action: 'refresh_token.created',
      ipAddress: ip,
      userAgent,
    });

    // Возвращаем оригинальный токен (НЕ хеш!)
    return token;
  }

  /**
   * Валидация refresh token
   */
  async validateRefreshToken(token: string): Promise<{ valid: boolean; userId?: number }> {
    try {
      const tokenHash = this.hashToken(token);

      const result = await pool.query(
        `SELECT id, user_id, expires_at, revoked 
         FROM refresh_tokens 
         WHERE token_hash = $1`,
        [tokenHash]
      );

      if (result.rows.length === 0) {
        return { valid: false };
      }

      const refreshToken = result.rows[0];

      // Проверка отзыва
      if (refreshToken.revoked) {
        return { valid: false };
      }

      // Проверка срока действия
      if (new Date(refreshToken.expires_at) < new Date()) {
        return { valid: false };
      }

      // Обновляем время последнего использования
      await pool.query(
        `UPDATE refresh_tokens SET last_used_at = NOW() WHERE id = $1`,
        [refreshToken.id]
      );

      return {
        valid: true,
        userId: refreshToken.user_id,
      };
    } catch (error) {
      logger.error('Refresh token validation error:', error);
      return { valid: false };
    }
  }

  /**
   * Отзыв refresh token
   */
  async revokeRefreshToken(token: string, userId?: number): Promise<void> {
    const tokenHash = this.hashToken(token);

    await pool.query(
      `UPDATE refresh_tokens 
       SET revoked = true, revoked_at = NOW() 
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (userId) {
      await auditService.log({
        userId,
        action: 'refresh_token.revoked',
      });
    }
  }

  /**
   * Отзыв всех refresh tokens пользователя
   */
  async revokeAllUserTokens(userId: number): Promise<void> {
    await pool.query(
      `UPDATE refresh_tokens 
       SET revoked = true, revoked_at = NOW() 
       WHERE user_id = $1 AND revoked = false`,
      [userId]
    );

    await auditService.log({
      userId,
      action: 'refresh_token.revoked_all',
    });
  }

  /**
   * Очистка истекших токенов
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await pool.query(
      `DELETE FROM refresh_tokens 
       WHERE expires_at < NOW() OR (revoked = true AND revoked_at < NOW() - INTERVAL '30 days')
       RETURNING id`
    );

    const deletedCount = result.rows.length;
    
    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} expired refresh tokens`);
    }

    return deletedCount;
  }

  /**
   * Получение активных токенов пользователя
   */
  async getUserActiveTokens(userId: number): Promise<any[]> {
    const result = await pool.query(
      `SELECT id, created_at, last_used_at, expires_at, ip_address, user_agent
       FROM refresh_tokens
       WHERE user_id = $1 AND revoked = false AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Хеширование токена для хранения
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Проверка подозрительной активности
   */
  async checkSuspiciousActivity(userId: number, ip: string): Promise<boolean> {
    // Проверяем количество активных токенов
    const activeTokens = await this.getUserActiveTokens(userId);
    
    if (activeTokens.length > 5) {
      logger.warn(`User ${userId} has ${activeTokens.length} active refresh tokens`);
      return true;
    }

    // Проверяем количество токенов с этого IP за последний час
    const recentTokens = await pool.query(
      `SELECT COUNT(*) as count
       FROM refresh_tokens
       WHERE user_id = $1 AND ip_address = $2 AND created_at > NOW() - INTERVAL '1 hour'`,
      [userId, ip]
    );

    if (parseInt(recentTokens.rows[0].count) > 3) {
      logger.warn(`Multiple refresh token requests from IP ${ip} for user ${userId}`);
      return true;
    }

    return false;
  }
}

export const refreshTokenService = new RefreshTokenService();
export default refreshTokenService;
