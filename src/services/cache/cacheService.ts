import redisClient from '../../config/redis';

/**
 * Сервис для кэширования данных
 */
class CacheService {
  /**
   * Получить данные из кэша
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redisClient.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      console.error('❌ Cache get error:', error);
      return null;
    }
  }

  /**
   * Сохранить данные в кэш
   */
  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<boolean> {
    try {
      const data = JSON.stringify(value);
      await redisClient.setEx(key, ttlSeconds, data);
      return true;
    } catch (error) {
      console.error('❌ Cache set error:', error);
      return false;
    }
  }

  /**
   * Удалить данные из кэша
   */
  async delete(key: string): Promise<boolean> {
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('❌ Cache delete error:', error);
      return false;
    }
  }

  /**
   * Удалить все ключи по паттерну
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length === 0) return 0;
      
      await redisClient.del(keys);
      return keys.length;
    } catch (error) {
      console.error('❌ Cache delete pattern error:', error);
      return 0;
    }
  }

  /**
   * Проверить существование ключа
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      console.error('❌ Cache exists error:', error);
      return false;
    }
  }

  /**
   * Получить или установить (если не существует)
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = 3600
  ): Promise<T | null> {
    try {
      // Пытаемся получить из кэша
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // Если нет в кэше - получаем данные
      const data = await fetchFn();
      
      // Сохраняем в кэш
      await this.set(key, data, ttlSeconds);
      
      return data;
    } catch (error) {
      console.error('❌ Cache getOrSet error:', error);
      return null;
    }
  }

  /**
   * Инкремент значения
   */
  async increment(key: string, ttlSeconds?: number): Promise<number> {
    try {
      const value = await redisClient.incr(key);
      
      if (ttlSeconds && value === 1) {
        await redisClient.expire(key, ttlSeconds);
      }
      
      return value;
    } catch (error) {
      console.error('❌ Cache increment error:', error);
      return 0;
    }
  }

  /**
   * Получить TTL ключа
   */
  async getTTL(key: string): Promise<number> {
    try {
      return await redisClient.ttl(key);
    } catch (error) {
      console.error('❌ Cache getTTL error:', error);
      return -1;
    }
  }

  /**
   * Кэширование результатов поиска
   */
  async cacheSearchResults(query: string, filters: any, results: any): Promise<void> {
    const key = this.generateSearchKey(query, filters);
    await this.set(key, results, 3600); // 1 час
  }

  /**
   * Получение кэшированных результатов поиска
   */
  async getCachedSearchResults(query: string, filters: any): Promise<any | null> {
    const key = this.generateSearchKey(query, filters);
    return await this.get(key);
  }

  /**
   * Кэширование данных пользователя
   */
  async cacheUserData(userId: number, data: any): Promise<void> {
    const key = `user:${userId}`;
    await this.set(key, data, 1800); // 30 минут
  }

  /**
   * Получение кэшированных данных пользователя
   */
  async getCachedUserData(userId: number): Promise<any | null> {
    const key = `user:${userId}`;
    return await this.get(key);
  }

  /**
   * Инвалидация кэша пользователя
   */
  async invalidateUserCache(userId: number): Promise<void> {
    const key = `user:${userId}`;
    await this.delete(key);
  }

  /**
   * Кэширование избранного пользователя
   */
  async cacheFavorites(userId: number, favorites: any[]): Promise<void> {
    const key = `favorites:${userId}`;
    await this.set(key, favorites, 600); // 10 минут
  }

  /**
   * Получение кэшированного избранного
   */
  async getCachedFavorites(userId: number): Promise<any[] | null> {
    const key = `favorites:${userId}`;
    return await this.get(key);
  }

  /**
   * Инвалидация кэша избранного
   */
  async invalidateFavoritesCache(userId: number): Promise<void> {
    const key = `favorites:${userId}`;
    await this.delete(key);
  }

  /**
   * Генерация ключа для поиска
   */
  private generateSearchKey(query: string, filters: any): string {
    const filtersStr = JSON.stringify(filters || {});
    return `search:${query}:${filtersStr}`;
  }

  /**
   * Очистка всего кэша (осторожно!)
   */
  async flushAll(): Promise<void> {
    try {
      await redisClient.flushAll();
      console.log('✅ Cache flushed');
    } catch (error) {
      console.error('❌ Cache flush error:', error);
    }
  }

  /**
   * Получение статистики кэша
   */
  async getStats(): Promise<any> {
    try {
      const info = await redisClient.info('stats');
      return info;
    } catch (error) {
      console.error('❌ Cache stats error:', error);
      return null;
    }
  }
}

export default new CacheService();
