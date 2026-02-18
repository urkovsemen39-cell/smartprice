"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceHistoryJob = void 0;
const priceHistoryService_1 = __importDefault(require("../priceHistory/priceHistoryService"));
const database_1 = __importDefault(require("../../config/database"));
const logger_1 = __importDefault(require("../../utils/logger"));
class PriceHistoryJob {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
    }
    start(intervalHours = 24) {
        if (this.intervalId) {
            logger_1.default.warn('Price history job already running');
            return;
        }
        logger_1.default.info(`Starting price history collection job (every ${intervalHours} hours)`);
        // Запускаем сразу
        this.collectPriceHistory();
        // И затем по расписанию
        this.intervalId = setInterval(() => {
            this.collectPriceHistory();
        }, intervalHours * 60 * 60 * 1000);
    }
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger_1.default.info('Price history job stopped');
        }
    }
    async collectPriceHistory() {
        if (this.isRunning) {
            logger_1.default.warn('Price history collection already in progress, skipping...');
            return;
        }
        this.isRunning = true;
        logger_1.default.info('Starting price history collection...');
        try {
            // Получаем все уникальные товары из отслеживания цен
            const result = await database_1.default.query(`
        SELECT DISTINCT product_id, marketplace, current_price, product_name
        FROM price_tracking
        WHERE active = true
      `);
            const products = result.rows;
            logger_1.default.info(`Collecting history for ${products.length} products`);
            let collectedCount = 0;
            for (const product of products) {
                try {
                    // Получаем актуальную цену
                    let currentPrice = product.current_price;
                    // TODO: Когда будут реальные интеграции, получать актуальную цену:
                    // const marketplace = getMarketplaceAdapter(product.marketplace);
                    // if (marketplace) {
                    //   const productData = await marketplace.getProduct(product.product_id);
                    //   if (productData) {
                    //     currentPrice = productData.price;
                    //   }
                    // }
                    // Записываем в историю
                    await priceHistoryService_1.default.recordPrice(product.product_id, product.marketplace, currentPrice);
                    collectedCount++;
                }
                catch (error) {
                    logger_1.default.error(`Error collecting history for ${product.product_id}:`, error);
                }
            }
            logger_1.default.info(`Price history collection completed. Collected: ${collectedCount}`);
            // Очистка старых записей (старше 1 года)
            const deletedCount = await priceHistoryService_1.default.cleanOldHistory(365);
            if (deletedCount > 0) {
                logger_1.default.info(`Cleaned ${deletedCount} old price history records`);
            }
        }
        catch (error) {
            logger_1.default.error('Price history collection error:', error);
        }
        finally {
            this.isRunning = false;
        }
    }
    // Метод для ручного запуска сбора
    async collectNow() {
        await this.collectPriceHistory();
    }
}
exports.PriceHistoryJob = PriceHistoryJob;
exports.default = new PriceHistoryJob();
