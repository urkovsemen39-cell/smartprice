/**
 * Unified Caching Service
 * Двухуровневое кэширование: L1 (Memory) + L2 (Redis)
 */

import NodeCache from 'node-cache';
import { redisClient } from '../../config/redis';
import { setWithExpiry, deleteKeys, flushDatabase } from '../../utils/redisHelpers';
import { CACHE } from '../../config/constants';
import logger from '../../utils/logger';

class AdvancedCacheService {
  private l1Cache: NodeCache;

  constructor() {
    // L1 Cache (Memory) - быстрый, но ограниченный
    this.l1Cache = new NodeCache({
      stdTTL: 300, // 5 минут по умолчанию
      checkperiod: 60, // Проверка каждую минуту
      maxKeys: 1000, // Максимум 1000 ключей
      useClones: false, // Не клонировать объекты для производительности
    });

    logger.info('Advanced caching service initialized (L1 + L2)');
  }

  // Получение из кэша (L1 -> L2)
  async get<T>(key: string): Promise<T | null> {
    try {
      // Проверка L1 (memory)
      const l1Value = this.l1Cache.get<T>(key);
      if (l1Value !== undefined) {
        logger.debug(`L1 cache hit: ${key}`);
        return l1Value;
      }

      // Проверка L2 (Redis)
      const l2Value = await redisClient.get(key);
      if (l2Value) {
        logger.debug(`L2 cache hit: ${key}`);
        const parsed = JSON.parse(l2Value) as T;
        
        // Сохранение в L1 для следующих запросов
        this.l1Cache.set(key, parsed);
        
        return parsed;
      }

      logger.debug(`Cache miss: ${key}`);
      return null;
    } catch (error) {
      logger.error('Error getting from cache:', error);
      return null;
    }
  }

  // Сохранение в кэш (L1 + L2)
  async set(key: string, value: any, ttlSeconds: number): Promise<boolean> {
    try {
      // Сохранение в L1
      this.l1Cache.set(key, value, ttlSeconds);

      // Сохранение в L2
      await setWithExpiry(key, JSON.stringify(value), ttlSeconds);

      return true;
    } catch (error) {
      logger.error('Error setting cache:', error);
      return false;
    }
  }

  // Удаление из кэша
  async delete(key: string): Promise<boolean> {
    try {
      this.l1Cache.del(key);
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error('Error deleting from cache:', error);
      return false;
    }
  }

  // Удаление по паттерну (только L2)
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length === 0) return 0;

      // Удаление из L1
      for (const key of keys) {
        this.l1Cache.del(key);
      }

      // Удаление из L2
      await deleteKeys(...keys);
      
      logger.info(`Deleted ${keys.length} keys matching pattern: ${pattern}`);
      return keys.length;
    } catch (error) {
      logger.error('Error deleting pattern:', error);
      return 0;
    }
  }

  // Get or Set (если нет в кэше - получить и закэшировать)
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number
  ): Promise<T | null> {
    try {
      // Проверка кэша
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // Получение данных
      const data = await fetchFn();
      if (data === null || data === undefined) {
        return null;
      }

      // Сохранение в кэш
      await this.set(key, data, ttlSeconds);

      return data;
    } catch (error) {
      logger.error('Error in getOrSet:', error);
      return null;
    }
  }

  // Cache warming - предзагрузка популярных данных
  async warmCache(warmingFn: () => Promise<void>): Promise<void> {
    try {
      logger.info('Starting cache warming...');
      await warmingFn();
      logger.info('Cache warming completed');
    } catch (error) {
      logger.error('Error warming cache:', error);
    }
  }

  // Статистика L1 кэша
  getL1Stats() {
    return {
      keys: this.l1Cache.keys().length,
      hits: this.l1Cache.getStats().hits,
      misses: this.l1Cache.getStats().misses,
      hitRate: this.l1Cache.getStats().hits / (this.l1Cache.getStats().hits + this.l1Cache.getStats().misses),
    };
  }

  // Очистка всего кэша
  async flush(): Promise<void> {
    this.l1Cache.flushAll();
    await flushDatabase();
    logger.info('Cache flushed (L1 + L2)');
  }

  // Специализированные методы для конкретных данных

  // Кэширование результатов поиска
  async cacheSearchResults(query: string, filters: any, results: any): Promise<void> {
    const key = `search:${query}:${JSON.stringify(filters)}`;
    await this.set(key, results, 3600); // 1 час
  }

  async getCachedSearchResults(query: string, filters: any): Promise<any | null> {
    const key = `search:${query}:${JSON.stringify(filters)}`;
    return await this.get(key);
  }

  // Кэширование данных пользователя
  async cacheUserData(userId: number, data: any): Promise<void> {
    const key = `user:${userId}`;
    await this.set(key, data, 1800); // 30 минут
  }

  async getCachedUserData(userId: number): Promise<any | null> {
    const key = `user:${userId}`;
    return await this.get(key);
  }

  async invalidateUserCache(userId: number): Promise<void> {
    await this.delete(`user:${userId}`);
    await this.deletePattern(`favorites:${userId}*`);
    await this.deletePattern(`price_tracking:${userId}*`);
  }

  // Кэширование избранного
  async cacheFavorites(userId: number, favorites: any[]): Promise<void> {
    const key = `favorites:${userId}`;
    await this.set(key, favorites, 600); // 10 минут
  }

  async getCachedFavorites(userId: number): Promise<any[] | null> {
    const key = `favorites:${userId}`;
    return await this.get(key);
  }

  async invalidateFavoritesCache(userId: number): Promise<void> {
    await this.delete(`favorites:${userId}`);
  }

  // Кэширование популярных товаров
  async cachePopularProducts(products: any[]): Promise<void> {
    await this.set('popular_products', products, 3600); // 1 час
  }

  async getCachedPopularProducts(): Promise<any[] | null> {
    return await this.get('popular_products');
  }

  // Кэширование подсказок поиска
  async cacheSuggestions(query: string, suggestions: string[]): Promise<void> {
    const key = `suggestions:${query}`;
    await this.set(key, suggestions, 1800); // 30 минут
  }

  async getCachedSuggestions(query: string): Promise<string[] | null> {
    const key = `suggestions:${query}`;
    return await this.get(key);
  }
}

export const advancedCacheService = new AdvancedCacheService();
