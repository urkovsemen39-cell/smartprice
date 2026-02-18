import crypto from 'crypto';
import { pool } from '../../config/database';
import { redisClient } from '../../config/redis';
import { setWithExpiry } from '../../utils/redisHelpers';

interface ApiKey {
  id: number;
  userId: number;
  keyHash: string;
  name: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

class ApiKeyService {
  // Генерация API ключа
  generateKey(): string {
    return `sk_${crypto.randomBytes(32).toString('hex')}`;
  }

  // Хеширование ключа
  hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  // Создание нового API ключа
  async createApiKey(
    userId: number,
    name: string,
    expiresInDays?: number
  ): Promise<{ key: string; id: number }> {
    try {
      const key = this.generateKey();
      const keyHash = this.hashKey(key);
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const result = await pool.query(
        `INSERT INTO api_keys (user_id, key_hash, name, expires_at) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id`,
        [userId, keyHash, name, expiresAt]
      );

      const logger = require('../../utils/logger').default;
      logger.info(`API key created for user ${userId}`);
      return { key, id: result.rows[0].id };
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error creating API key:', error);
      throw error;
    }
  }

  // Проверка валидности ключа
  async validateKey(key: string): Promise<{ valid: boolean; userId?: number; keyId?: number }> {
    try {
      const keyHash = this.hashKey(key);

      const result = await pool.query(
        `SELECT id, user_id FROM api_keys 
         WHERE key_hash = $1 
           AND is_active = true 
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [keyHash]
      );

      if (result.rowCount === 0) {
        return { valid: false };
      }

      // Обновление времени последнего использования
      await pool.query(
        `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
        [result.rows[0].id]
      );

      return {
        valid: true,
        userId: result.rows[0].user_id,
        keyId: result.rows[0].id,
      };
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error validating API key:', error);
      return { valid: false };
    }
  }

  // Получение всех ключей пользователя (с пагинацией)
  async getUserKeys(userId: number, limit: number = 20, offset: number = 0): Promise<ApiKey[]> {
    try {
      const result = await pool.query(
        `SELECT id, user_id, name, last_used_at, expires_at, revoked as is_active, created_at 
         FROM api_keys 
         WHERE user_id = $1 
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        keyHash: '***', // Не возвращаем хеш
        name: row.name,
        lastUsedAt: row.last_used_at,
        expiresAt: row.expires_at,
        isActive: !row.is_active,
        createdAt: row.created_at,
      }));
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error getting user keys:', error);
      return [];
    }
  }

  // Получение количества ключей пользователя
  async getUserKeysCount(userId: number): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM api_keys WHERE user_id = $1`,
        [userId]
      );

      return parseInt(result.rows[0].count);
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error getting user keys count:', error);
      return 0;
    }
  }

  // Отзыв ключа
  async revokeKey(userId: number, keyId: number): Promise<boolean> {
    try {
      const result = await pool.query(
        `UPDATE api_keys 
         SET is_active = false 
         WHERE id = $1 AND user_id = $2`,
        [keyId, userId]
      );

      const logger = require('../../utils/logger').default;
      logger.info(`API key ${keyId} revoked`);
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error revoking API key:', error);
      return false;
    }
  }

  // Логирование использования ключа
  async logUsage(
    keyId: number,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTimeMs: number
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO api_key_usage 
         (api_key_id, endpoint, method, status_code, response_time_ms) 
         VALUES ($1, $2, $3, $4, $5)`,
        [keyId, endpoint, method, statusCode, responseTimeMs]
      );
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error logging API key usage:', error);
    }
  }

  // Rate limiting для API ключа
  async checkRateLimit(keyId: number, limit: number = 1000, windowMs: number = 3600000): Promise<boolean> {
    try {
      const key = `api_key_rate_limit:${keyId}`;
      const count = await redisClient.get(key);
      const currentCount = count ? parseInt(count) : 0;

      if (currentCount >= limit) {
        return false;
      }

      if (currentCount === 0) {
        await setWithExpiry(key, '1', Math.floor(windowMs / 1000));
      } else {
        await redisClient.incr(key);
      }

      return true;
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error checking rate limit:', error);
      return true; // В случае ошибки разрешаем запрос
    }
  }

  // Статистика использования ключа
  async getKeyStats(keyId: number, days: number = 7): Promise<any> {
    try {
      const result = await pool.query(
        `SELECT 
           COUNT(*) as total_requests,
           AVG(response_time_ms) as avg_response_time,
           COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
         FROM api_key_usage 
         WHERE api_key_id = $1 
           AND created_at > NOW() - INTERVAL '${days} days'`,
        [keyId]
      );

      return result.rows[0];
    } catch (error) {
      const logger = require('../../utils/logger').default;
      logger.error('Error getting key stats:', error);
      return null;
    }
  }
}

export const apiKeyService = new ApiKeyService();
