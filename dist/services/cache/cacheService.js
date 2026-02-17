"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const redis_1 = __importDefault(require("../../config/redis"));
/**
 * Сервис для кэширования данных
 */
class CacheService {
    /**
     * Получить данные из кэша
     */
    async get(key) {
        try {
            const data = await redis_1.default.get(key);
            if (!data)
                return null;
            return JSON.parse(data);
        }
        catch (error) {
            console.error('❌ Cache get error:', error);
            return null;
        }
    }
    /**
     * Сохранить данные в кэш
     */
    async set(key, value, ttlSeconds = 3600) {
        try {
            const data = JSON.stringify(value);
            await redis_1.default.setEx(key, ttlSeconds, data);
            return true;
        }
        catch (error) {
            console.error('❌ Cache set error:', error);
            return false;
        }
    }
    /**
     * Удалить данные из кэша
     */
    async delete(key) {
        try {
            await redis_1.default.del(key);
            return true;
        }
        catch (error) {
            console.error('❌ Cache delete error:', error);
            return false;
        }
    }
    /**
     * Удалить все ключи по паттерну
     */
    async deletePattern(pattern) {
        try {
            const keys = await redis_1.default.keys(pattern);
            if (keys.length === 0)
                return 0;
            await redis_1.default.del(keys);
            return keys.length;
        }
        catch (error) {
            console.error('❌ Cache delete pattern error:', error);
            return 0;
        }
    }
    /**
     * Проверить существование ключа
     */
    async exists(key) {
        try {
            const result = await redis_1.default.exists(key);
            return result === 1;
        }
        catch (error) {
            console.error('❌ Cache exists error:', error);
            return false;
        }
    }
    /**
     * Получить или установить (если не существует)
     */
    async getOrSet(key, fetchFn, ttlSeconds = 3600) {
        try {
            // Пытаемся получить из кэша
            const cached = await this.get(key);
            if (cached !== null) {
                return cached;
            }
            // Если нет в кэше - получаем данные
            const data = await fetchFn();
            // Сохраняем в кэш
            await this.set(key, data, ttlSeconds);
            return data;
        }
        catch (error) {
            console.error('❌ Cache getOrSet error:', error);
            return null;
        }
    }
    /**
     * Инкремент значения
     */
    async increment(key, ttlSeconds) {
        try {
            const value = await redis_1.default.incr(key);
            if (ttlSeconds && value === 1) {
                await redis_1.default.expire(key, ttlSeconds);
            }
            return value;
        }
        catch (error) {
            console.error('❌ Cache increment error:', error);
            return 0;
        }
    }
    /**
     * Получить TTL ключа
     */
    async getTTL(key) {
        try {
            return await redis_1.default.ttl(key);
        }
        catch (error) {
            console.error('❌ Cache getTTL error:', error);
            return -1;
        }
    }
    /**
     * Кэширование результатов поиска
     */
    async cacheSearchResults(query, filters, sort, results, popularity) {
        const key = this.generateSearchKey(query, filters, sort);
        // TTL зависит от популярности: популярные запросы кэшируем дольше
        const ttl = popularity && popularity > 10 ? 7200 : 3600; // 2 часа или 1 час
        await this.set(key, results, ttl);
    }
    /**
     * Получение кэшированных результатов поиска
     */
    async getCachedSearchResults(query, filters, sort) {
        const key = this.generateSearchKey(query, filters, sort);
        return await this.get(key);
    }
    /**
     * Кэширование подсказок для автодополнения
     */
    async cacheSuggestions(query, suggestions) {
        const key = `suggestions:${query.toLowerCase()}`;
        await this.set(key, suggestions, 1800); // 30 минут
    }
    /**
     * Получение кэшированных подсказок
     */
    async getCachedSuggestions(query) {
        const key = `suggestions:${query.toLowerCase()}`;
        return await this.get(key);
    }
    /**
     * Кэширование данных пользователя
     */
    async cacheUserData(userId, data) {
        const key = `user:${userId}`;
        await this.set(key, data, 1800); // 30 минут
    }
    /**
     * Получение кэшированных данных пользователя
     */
    async getCachedUserData(userId) {
        const key = `user:${userId}`;
        return await this.get(key);
    }
    /**
     * Инвалидация кэша пользователя
     */
    async invalidateUserCache(userId) {
        const key = `user:${userId}`;
        await this.delete(key);
    }
    /**
     * Кэширование избранного пользователя
     */
    async cacheFavorites(userId, favorites) {
        const key = `favorites:${userId}`;
        await this.set(key, favorites, 600); // 10 минут
    }
    /**
     * Получение кэшированного избранного
     */
    async getCachedFavorites(userId) {
        const key = `favorites:${userId}`;
        return await this.get(key);
    }
    /**
     * Инвалидация кэша избранного
     */
    async invalidateFavoritesCache(userId) {
        const key = `favorites:${userId}`;
        await this.delete(key);
    }
    /**
     * Генерация ключа для поиска
     */
    generateSearchKey(query, filters, sort) {
        const filtersStr = JSON.stringify(filters || {});
        const sortStr = sort || 'smart';
        return `search:${query}:${filtersStr}:${sortStr}`;
    }
    /**
     * Очистка всего кэша (осторожно!)
     */
    async flushAll() {
        try {
            await redis_1.default.flushAll();
            console.log('✅ Cache flushed');
        }
        catch (error) {
            console.error('❌ Cache flush error:', error);
        }
    }
    /**
     * Получение статистики кэша
     */
    async getStats() {
        try {
            const info = await redis_1.default.info('stats');
            return info;
        }
        catch (error) {
            console.error('❌ Cache stats error:', error);
            return null;
        }
    }
}
exports.default = new CacheService();
