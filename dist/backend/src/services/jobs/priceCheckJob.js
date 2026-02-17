"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceCheckJob = void 0;
const priceTrackingService_1 = __importDefault(require("../priceTracking/priceTrackingService"));
const priceHistoryService_1 = __importDefault(require("../priceHistory/priceHistoryService"));
const emailService_1 = __importDefault(require("../email/emailService"));
const database_1 = __importDefault(require("../../config/database"));
class PriceCheckJob {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
    }
    start(intervalMinutes = 60) {
        if (this.intervalId) {
            console.log('⚠️ Price check job already running');
            return;
        }
        console.log(`✅ Starting price check job (every ${intervalMinutes} minutes)`);
        // Запускаем сразу
        this.checkPrices();
        // И затем по расписанию
        this.intervalId = setInterval(() => {
            this.checkPrices();
        }, intervalMinutes * 60 * 1000);
    }
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('✅ Price check job stopped');
        }
    }
    async checkPrices() {
        if (this.isRunning) {
            console.log('⚠️ Price check already in progress, skipping...');
            return;
        }
        this.isRunning = true;
        console.log('🔍 Starting price check...');
        try {
            const alerts = await priceTrackingService_1.default.getAlertsToCheck();
            console.log(`📊 Checking ${alerts.length} price alerts`);
            let notifiedCount = 0;
            let updatedCount = 0;
            for (const alert of alerts) {
                try {
                    // Получаем актуальную цену из маркетплейса
                    let currentPrice = alert.current_price;
                    // TODO: Когда будут реальные интеграции, раскомментировать:
                    // const marketplace = getMarketplaceAdapter(alert.marketplace);
                    // if (marketplace) {
                    //   const product = await marketplace.getProduct(alert.product_id);
                    //   if (product) {
                    //     currentPrice = product.price;
                    //   }
                    // }
                    // Пока используем симуляцию изменения цены (для тестирования)
                    // В реальности это будет актуальная цена из API маркетплейса
                    if (Math.random() > 0.7) {
                        // 30% шанс что цена изменилась
                        const change = (Math.random() - 0.5) * 0.2; // ±10%
                        currentPrice = Math.max(1, currentPrice * (1 + change));
                    }
                    // Обновляем цену в отслеживании
                    if (currentPrice !== alert.current_price) {
                        await priceTrackingService_1.default.updatePrice(alert.id, currentPrice);
                        updatedCount++;
                    }
                    // Записываем в историю цен
                    await priceHistoryService_1.default.recordPrice(alert.product_id, alert.marketplace, currentPrice);
                    // Проверяем, достигнута ли целевая цена
                    if (currentPrice <= alert.target_price && !alert.notified) {
                        // Получаем email пользователя
                        const userResult = await database_1.default.query('SELECT email, name FROM users WHERE id = $1', [alert.user_id]);
                        if (userResult.rows.length > 0) {
                            const { email, name } = userResult.rows[0];
                            // Отправляем уведомление
                            const emailSent = await emailService_1.default.sendPriceAlert(email, alert.product_name, Number(alert.target_price), currentPrice, alert.product_url);
                            if (emailSent) {
                                // Помечаем как уведомленное
                                await priceTrackingService_1.default.checkAndNotify(alert.id);
                                notifiedCount++;
                                console.log(`✅ Notified ${name || email} about ${alert.product_name}`);
                            }
                            else {
                                console.warn(`⚠️ Failed to send email to ${email}`);
                            }
                        }
                    }
                }
                catch (error) {
                    console.error(`❌ Error checking alert ${alert.id}:`, error);
                }
            }
            console.log(`✅ Price check completed. Updated: ${updatedCount}, Notified: ${notifiedCount}`);
        }
        catch (error) {
            console.error('❌ Price check job error:', error);
        }
        finally {
            this.isRunning = false;
        }
    }
}
exports.PriceCheckJob = PriceCheckJob;
exports.default = new PriceCheckJob();
