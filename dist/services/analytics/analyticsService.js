"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const database_1 = __importDefault(require("../../config/database"));
class AnalyticsService {
    async trackClick(userId, productId, marketplace, query) {
        try {
            await database_1.default.query('INSERT INTO click_analytics (user_id, product_id, marketplace, query) VALUES ($1, $2, $3, $4)', [userId, productId, marketplace, query]);
        }
        catch (error) {
            console.error('❌ Track click error:', error);
        }
    }
    async trackSearch(userId, query, filters, resultsCount) {
        try {
            // Валидация и санитизация
            if (typeof query !== 'string' || query.length > 500) {
                console.warn('⚠️ Invalid query for tracking');
                return;
            }
            let filtersJson = '{}';
            try {
                filtersJson = JSON.stringify(filters || {});
            }
            catch (e) {
                console.warn('⚠️ Failed to stringify filters');
            }
            await database_1.default.query('INSERT INTO search_history (user_id, query, filters, results_count) VALUES ($1, $2, $3, $4)', [userId, query, filtersJson, resultsCount]);
            await database_1.default.query(`INSERT INTO popular_queries (query, search_count, last_searched)
         VALUES ($1, 1, NOW())
         ON CONFLICT (query) DO UPDATE
         SET search_count = popular_queries.search_count + 1, last_searched = NOW()`, [query.toLowerCase().trim()]);
        }
        catch (error) {
            console.error('❌ Track search error:', error);
        }
    }
    async getPopularQueries(limit = 10) {
        try {
            const result = await database_1.default.query('SELECT query FROM popular_queries ORDER BY search_count DESC LIMIT $1', [limit]);
            return result.rows.map(row => row.query);
        }
        catch (error) {
            console.error('❌ Get popular queries error:', error);
            return [];
        }
    }
    async getUserSearchHistory(userId, limit = 20) {
        try {
            const result = await database_1.default.query('SELECT query, searched_at FROM search_history WHERE user_id = $1 ORDER BY searched_at DESC LIMIT $2', [userId, limit]);
            return result.rows;
        }
        catch (error) {
            console.error('❌ Get search history error:', error);
            return [];
        }
    }
    async getQueryPopularity(query) {
        try {
            const result = await database_1.default.query('SELECT search_count FROM popular_queries WHERE query = $1', [query.toLowerCase().trim()]);
            if (result.rows.length === 0)
                return 'rare';
            const count = result.rows[0].search_count;
            if (count >= 100)
                return 'popular';
            if (count >= 10)
                return 'normal';
            return 'rare';
        }
        catch (error) {
            console.error('❌ Get query popularity error:', error);
            return 'normal';
        }
    }
    async getQueryPopularityCount(query) {
        try {
            const result = await database_1.default.query('SELECT search_count FROM popular_queries WHERE query = $1', [query.toLowerCase().trim()]);
            if (result.rows.length === 0)
                return 0;
            return result.rows[0].search_count;
        }
        catch (error) {
            console.error('❌ Get query popularity count error:', error);
            return 0;
        }
    }
}
exports.AnalyticsService = AnalyticsService;
exports.default = new AnalyticsService();
