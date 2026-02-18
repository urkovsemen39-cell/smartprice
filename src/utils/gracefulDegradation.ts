/**
 * Graceful Degradation Utilities
 * Обеспечивает работу приложения при недоступности зависимостей
 */

import NodeCache from 'node-cache';
import logger from './logger';

// In-memory fallback cache с ограничением размера
const memoryCache = new NodeCache({ 
  stdTTL: 300, 
  checkperiod: 60,
  maxKeys: 10000, // Ограничение для предотвращения memory leak
  useClones: false // Оптимизация производительности
});

export class GracefulDegradation {
  private static redisAvailable = true;
  private static dbAvailable = true;

  /**
   * Установка статуса Redis
   */
  static setRedisStatus(available: boolean): void {
    if (this.redisAvailable !== available) {
      this.redisAvailable = available;
      if (available) {
        logger.info('✅ Redis connection restored');
      } else {
        logger.warn('⚠️  Redis unavailable, using in-memory fallback');
      }
    }
  }

  /**
   * Установка статуса БД
   */
  static setDBStatus(available: boolean): void {
    if (this.dbAvailable !== available) {
      this.dbAvailable = available;
      if (available) {
        logger.info('✅ Database connection restored');
      } else {
        logger.error('❌ Database unavailable, entering read-only mode');
      }
    }
  }

  /**
   * Проверка доступности Redis
   */
  static isRedisAvailable(): boolean {
    return this.redisAvailable;
  }

  /**
   * Проверка доступности БД
   */
  static isDBAvailable(): boolean {
    return this.dbAvailable;
  }

  /**
   * Fallback cache операции
   */
  static async cacheGet(key: string, redisFn: () => Promise<string | null>): Promise<string | null> {
    if (this.redisAvailable) {
      try {
        return await redisFn();
      } catch (error) {
        logger.warn(`Redis error, using memory cache: ${error}`);
        this.setRedisStatus(false);
        return memoryCache.get(key) || null;
      }
    }
    return memoryCache.get(key) || null;
  }

  static async cacheSet(
    key: string,
    value: string,
    ttl: number,
    redisFn: () => Promise<void>
  ): Promise<void> {
    // Всегда сохраняем в memory cache как fallback
    memoryCache.set(key, value, ttl);

    if (this.redisAvailable) {
      try {
        await redisFn();
      } catch (error) {
        logger.warn(`Redis error: ${error}`);
        this.setRedisStatus(false);
      }
    }
  }

  static async cacheDel(key: string, redisFn: () => Promise<void>): Promise<void> {
    memoryCache.del(key);

    if (this.redisAvailable) {
      try {
        await redisFn();
      } catch (error) {
        logger.warn(`Redis error: ${error}`);
        this.setRedisStatus(false);
      }
    }
  }

  /**
   * Получение fallback данных из memory cache
   */
  static getFromMemoryCache<T>(key: string): T | undefined {
    return memoryCache.get(key);
  }

  /**
   * Сохранение в memory cache
   */
  static setInMemoryCache<T>(key: string, value: T, ttl?: number): void {
    memoryCache.set(key, value, ttl || 300);
  }

  /**
   * Очистка memory cache
   */
  static clearMemoryCache(): void {
    memoryCache.flushAll();
    logger.info('Memory cache cleared');
  }

  /**
   * Статистика memory cache
   */
  static getMemoryCacheStats() {
    const stats = memoryCache.getStats();
    return {
      keys: memoryCache.keys().length,
      hits: stats.hits,
      misses: stats.misses,
      ksize: stats.ksize,
      vsize: stats.vsize,
    };
  }
}

export default GracefulDegradation;
