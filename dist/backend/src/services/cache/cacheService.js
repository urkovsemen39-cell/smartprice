"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const redis_1 = __importDefault(require("../../config/redis"));
const CACHE_TTL = {
    popular: 900, // 15 минут для популярных запросов
    normal: 1800, // 30 минут для обычных
    rare: 3600, // 60 минут для редких
    product: 3600, // 1 час для деталей товара
    suggestions: 86400 // 24 часа для автодополнения
};
class CacheService {
    hashQuery(query) {
        return query.toLowerCase().trim().replace(/\s+/g, '_');
    }
    async cacheSearchResults(query, filters, sort, results, popularity = 'normal') {
        try {
            const key = `search:${this.hashQuery(query)}:${JSON.stringify(filters)}:${sort}`;
            const ttl = CACHE_TTL[popularity];
            await redis_1.default.setEx(key, ttl, JSON.stringify(results));
        }
        catch (error) {
            console.error('❌ Cache write error:', error);
        }
    }
    async getCachedSearchResults(query, filters, sort) {
        try {
            const key = `search:${this.hashQuery(query)}:${JSON.stringify(filters)}:${sort}`;
            const cached = await redis_1.default.get(key);
            if (cached) {
                return JSON.parse(cached);
            }
            return null;
        }
        catch (error) {
            console.error('❌ Cache read error:', error);
            return null;
        }
    }
    async cacheProduct(productId, product) {
        try {
            const key = `product:${productId}`;
            await redis_1.default.setEx(key, CACHE_TTL.product, JSON.stringify(product));
        }
        catch (error) {
            console.error('❌ Cache product error:', error);
        }
    }
    async getCachedProduct(productId) {
        try {
            const cached = await redis_1.default.get(`product:${productId}`);
            return cached ? JSON.parse(cached) : null;
        }
        catch (error) {
            console.error('❌ Get cached product error:', error);
            return null;
        }
    }
    async cacheSuggestions(prefix, suggestions) {
        try {
            const key = `suggestions:${this.hashQuery(prefix)}`;
            await redis_1.default.setEx(key, CACHE_TTL.suggestions, JSON.stringify(suggestions));
        }
        catch (error) {
            console.error('❌ Cache suggestions error:', error);
        }
    }
    async getCachedSuggestions(prefix) {
        try {
            const cached = await redis_1.default.get(`suggestions:${this.hashQuery(prefix)}`);
            return cached ? JSON.parse(cached) : null;
        }
        catch (error) {
            console.error('❌ Get cached suggestions error:', error);
            return null;
        }
    }
    async invalidateProduct(productId) {
        try {
            await redis_1.default.del(`product:${productId}`);
        }
        catch (error) {
            console.error('❌ Cache invalidation error:', error);
        }
    }
    async clearAll() {
        try {
            await redis_1.default.flushAll();
        }
        catch (error) {
            console.error('❌ Cache clear error:', error);
        }
    }
}
exports.CacheService = CacheService;
exports.default = new CacheService();
