"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FavoritesService = void 0;
const database_1 = __importDefault(require("../../config/database"));
const logger_1 = __importDefault(require("../../utils/logger"));
class FavoritesService {
    async addFavorite(userId, product) {
        try {
            // Валидация URL
            if (!this.isValidUrl(product.url)) {
                throw new Error('Invalid product URL');
            }
            // Санитизация данных
            const sanitizedName = product.name.substring(0, 500);
            const sanitizedUrl = product.url.substring(0, 2000);
            const sanitizedImage = product.image.substring(0, 2000);
            const result = await database_1.default.query(`INSERT INTO favorites 
        (user_id, product_id, marketplace, product_name, product_price, product_image, product_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id, product_id) DO UPDATE
        SET product_price = $5, updated_at = NOW()
        RETURNING *`, [
                userId,
                product.id,
                product.marketplace,
                sanitizedName,
                product.price,
                sanitizedImage,
                sanitizedUrl,
            ]);
            return result.rows[0];
        }
        catch (error) {
            logger_1.default.error('Add favorite error:', error);
            throw error;
        }
    }
    async removeFavorite(userId, productId) {
        try {
            const result = await database_1.default.query('DELETE FROM favorites WHERE user_id = $1 AND product_id = $2', [userId, productId]);
            return result.rowCount > 0;
        }
        catch (error) {
            logger_1.default.error('Remove favorite error:', error);
            throw error;
        }
    }
    async getFavorites(userId, page = 1, limit = 20) {
        try {
            const offset = (page - 1) * limit;
            // Получаем общее количество
            const countResult = await database_1.default.query('SELECT COUNT(*) FROM favorites WHERE user_id = $1', [userId]);
            const total = parseInt(countResult.rows[0].count);
            // Получаем данные с пагинацией
            const result = await database_1.default.query('SELECT * FROM favorites WHERE user_id = $1 ORDER BY added_at DESC LIMIT $2 OFFSET $3', [userId, limit, offset]);
            return {
                favorites: result.rows,
                total,
                page,
                totalPages: Math.ceil(total / limit),
            };
        }
        catch (error) {
            logger_1.default.error('Get favorites error:', error);
            throw error;
        }
    }
    async isFavorite(userId, productId) {
        try {
            const result = await database_1.default.query('SELECT id FROM favorites WHERE user_id = $1 AND product_id = $2', [userId, productId]);
            return result.rows.length > 0;
        }
        catch (error) {
            logger_1.default.error('Check favorite error:', error);
            return false;
        }
    }
    isValidUrl(url) {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        }
        catch {
            return false;
        }
    }
}
exports.FavoritesService = FavoritesService;
exports.default = new FavoritesService();
