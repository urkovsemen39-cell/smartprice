"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceTrackingService = void 0;
const database_1 = __importDefault(require("../../config/database"));
const logger_1 = __importDefault(require("../../utils/logger"));
class PriceTrackingService {
    async createAlert(userId, productId, marketplace, productName, targetPrice, currentPrice, productUrl) {
        try {
            // Проверка на дубликаты
            const existing = await database_1.default.query(`SELECT id FROM price_tracking 
         WHERE user_id = $1 AND product_id = $2 AND marketplace = $3 AND active = true`, [userId, productId, marketplace]);
            if (existing.rows.length > 0) {
                throw new Error('You are already tracking this product');
            }
            // Санитизация данных
            const sanitizedName = productName.substring(0, 500);
            const sanitizedUrl = productUrl.substring(0, 2000);
            const result = await database_1.default.query(`INSERT INTO price_tracking 
        (user_id, product_id, marketplace, product_name, target_price, current_price, product_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`, [userId, productId, marketplace, sanitizedName, targetPrice, currentPrice, sanitizedUrl]);
            return result.rows[0];
        }
        catch (error) {
            logger_1.default.error('Create alert error:', error);
            throw error;
        }
    }
    async getAlerts(userId, activeOnly = true, page = 1, limit = 20) {
        try {
            const offset = (page - 1) * limit;
            const whereClause = activeOnly
                ? 'WHERE user_id = $1 AND active = true'
                : 'WHERE user_id = $1';
            // Получаем общее количество
            const countResult = await database_1.default.query(`SELECT COUNT(*) FROM price_tracking ${whereClause}`, [userId]);
            const total = parseInt(countResult.rows[0].count);
            // Получаем данные с пагинацией
            const result = await database_1.default.query(`SELECT * FROM price_tracking ${whereClause} 
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]);
            return {
                alerts: result.rows,
                total,
                page,
                totalPages: Math.ceil(total / limit),
            };
        }
        catch (error) {
            logger_1.default.error('Get alerts error:', error);
            throw error;
        }
    }
    async updatePrice(alertId, newPrice) {
        try {
            await database_1.default.query('UPDATE price_tracking SET current_price = $1, updated_at = NOW() WHERE id = $2', [newPrice, alertId]);
        }
        catch (error) {
            logger_1.default.error('Update price error:', error);
            throw error;
        }
    }
    async checkAndNotify(alertId) {
        try {
            const result = await database_1.default.query('SELECT * FROM price_tracking WHERE id = $1', [alertId]);
            if (result.rows.length === 0)
                return false;
            const alert = result.rows[0];
            if (alert.current_price <= alert.target_price && !alert.notified) {
                await database_1.default.query('UPDATE price_tracking SET notified = true, updated_at = NOW() WHERE id = $1', [alertId]);
                return true;
            }
            return false;
        }
        catch (error) {
            logger_1.default.error('Check and notify error:', error);
            return false;
        }
    }
    async deactivateAlert(userId, alertId) {
        try {
            const result = await database_1.default.query('UPDATE price_tracking SET active = false, updated_at = NOW() WHERE id = $1 AND user_id = $2', [alertId, userId]);
            return result.rowCount > 0;
        }
        catch (error) {
            logger_1.default.error('Deactivate alert error:', error);
            throw error;
        }
    }
    async deleteAlert(userId, alertId) {
        try {
            const result = await database_1.default.query('DELETE FROM price_tracking WHERE id = $1 AND user_id = $2', [alertId, userId]);
            return result.rowCount > 0;
        }
        catch (error) {
            logger_1.default.error('Delete alert error:', error);
            throw error;
        }
    }
    async getAlertsToCheck() {
        try {
            const result = await database_1.default.query(`SELECT * FROM price_tracking 
         WHERE active = true AND notified = false
         ORDER BY updated_at ASC`);
            return result.rows;
        }
        catch (error) {
            logger_1.default.error('Get alerts to check error:', error);
            return [];
        }
    }
}
exports.PriceTrackingService = PriceTrackingService;
exports.default = new PriceTrackingService();
