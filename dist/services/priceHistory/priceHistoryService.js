"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceHistoryService = void 0;
const database_1 = __importDefault(require("../../config/database"));
const logger_1 = __importDefault(require("../../utils/logger"));
class PriceHistoryService {
    async recordPrice(productId, marketplace, price) {
        try {
            await database_1.default.query('INSERT INTO price_history (product_id, marketplace, price) VALUES ($1, $2, $3)', [productId, marketplace, price]);
        }
        catch (error) {
            logger_1.default.error('Record price error:', error);
            throw error;
        }
    }
    async getPriceHistory(productId, marketplace, days = 30) {
        try {
            const result = await database_1.default.query(`SELECT * FROM price_history 
         WHERE product_id = $1 AND marketplace = $2 
         AND recorded_at >= NOW() - INTERVAL '${days} days'
         ORDER BY recorded_at ASC`, [productId, marketplace]);
            return result.rows;
        }
        catch (error) {
            logger_1.default.error('Get price history error:', error);
            throw error;
        }
    }
    async getLatestPrice(productId, marketplace) {
        try {
            const result = await database_1.default.query(`SELECT price FROM price_history 
         WHERE product_id = $1 AND marketplace = $2 
         ORDER BY recorded_at DESC LIMIT 1`, [productId, marketplace]);
            return result.rows.length > 0 ? Number(result.rows[0].price) : null;
        }
        catch (error) {
            logger_1.default.error('Get latest price error:', error);
            return null;
        }
    }
    async cleanOldHistory(daysToKeep = 365) {
        try {
            const result = await database_1.default.query(`DELETE FROM price_history 
         WHERE recorded_at < NOW() - INTERVAL '${daysToKeep} days'`);
            return result.rowCount || 0;
        }
        catch (error) {
            logger_1.default.error('Clean old history error:', error);
            return 0;
        }
    }
}
exports.PriceHistoryService = PriceHistoryService;
exports.default = new PriceHistoryService();
