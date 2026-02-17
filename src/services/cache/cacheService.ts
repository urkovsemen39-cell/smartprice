import redisClient from '../../config/redis';
import { Product, SearchResponse } from '../../types';

const CACHE_TTL = {
  popular: 900,      // 15 минут для популярных запросов
  normal: 1800,      // 30 минут для обычных
  rare: 3600,        // 60 минут для редких
  product: 3600,     // 1 час для деталей товара
  suggestions: 86400 // 24 часа для автодополнения
};

export class CacheService {
  private hashQuery(query: string): string {
    return query.toLowerCase().trim().replace(/\s+/g, '_');
  }

  async cacheSearchResults(
    query: string,
    filters: any,
    sort: string,
    results: SearchResponse,
    popularity: 'popular' | 'normal' | 'rare' = 'normal'
  ): Promise<void> {
    try {
      const key = `search:${this.hashQuery(query)}:${JSON.stringify(filters)}:${sort}`;
      const ttl = CACHE_TTL[popularity];
      
      await redisClient.setEx(key, ttl, JSON.stringify(results));
    } catch (error) {
      console.error('❌ Cache write error:', error);
    }
  }

  async getCachedSearchResults(
    query: string,
    filters: any,
    sort: string
  ): Promise<SearchResponse | null> {
    try {
      const key = `search:${this.hashQuery(query)}:${JSON.stringify(filters)}:${sort}`;
      const cached = await redisClient.get(key);
      
      if (cached) {
        return JSON.parse(cached);
      }
      
      return null;
    } catch (error) {
      console.error('❌ Cache read error:', error);
      return null;
    }
  }

  async cacheProduct(productId: string, product: Product): Promise<void> {
    try {
      const key = `product:${productId}`;
      await redisClient.setEx(key, CACHE_TTL.product, JSON.stringify(product));
    } catch (error) {
      console.error('❌ Cache product error:', error);
    }
  }

  async getCachedProduct(productId: string): Promise<Product | null> {
    try {
      const cached = await redisClient.get(`product:${productId}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('❌ Get cached product error:', error);
      return null;
    }
  }

  async cacheSuggestions(prefix: string, suggestions: string[]): Promise<void> {
    try {
      const key = `suggestions:${this.hashQuery(prefix)}`;
      await redisClient.setEx(key, CACHE_TTL.suggestions, JSON.stringify(suggestions));
    } catch (error) {
      console.error('❌ Cache suggestions error:', error);
    }
  }

  async getCachedSuggestions(prefix: string): Promise<string[] | null> {
    try {
      const cached = await redisClient.get(`suggestions:${this.hashQuery(prefix)}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('❌ Get cached suggestions error:', error);
      return null;
    }
  }

  async invalidateProduct(productId: string): Promise<void> {
    try {
      await redisClient.del(`product:${productId}`);
    } catch (error) {
      console.error('❌ Cache invalidation error:', error);
    }
  }

  async clearAll(): Promise<void> {
    try {
      await redisClient.flushAll();
    } catch (error) {
      console.error('❌ Cache clear error:', error);
    }
  }
}

export default new CacheService();
