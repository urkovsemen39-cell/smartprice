import priceTrackingService from '../priceTracking/priceTrackingService';
import priceHistoryService from '../priceHistory/priceHistoryService';
import emailService from '../email/emailService';
import db from '../../config/database';
import logger from '../../utils/logger';

export class PriceCheckJob {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  start(intervalMinutes: number = 60) {
    if (this.intervalId) {
      logger.warn('Price check job already running');
      return;
    }

    logger.info(`Starting price check job (every ${intervalMinutes} minutes)`);
    
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
      logger.info('Price check job stopped');
    }
  }

  private async checkPrices() {
    if (this.isRunning) {
      logger.warn('Price check already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    logger.info('Starting price check...');

    try {
      const alerts = await priceTrackingService.getAlertsToCheck();
      logger.info(`Checking ${alerts.length} price alerts`);

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
            await priceTrackingService.updatePrice(alert.id, currentPrice);
            updatedCount++;
          }

          // Записываем в историю цен
          await priceHistoryService.recordPrice(
            alert.product_id,
            alert.marketplace,
            currentPrice
          );

          // Проверяем, достигнута ли целевая цена
          if (currentPrice <= alert.target_price && !alert.notified) {
            // Получаем email пользователя
            const userResult = await db.query(
              'SELECT email, name FROM users WHERE id = $1',
              [alert.user_id]
            );

            if (userResult.rows.length > 0) {
              const { email, name } = userResult.rows[0];

              // Отправляем уведомление
              const emailSent = await emailService.sendPriceAlert(
                email,
                alert.product_name,
                Number(alert.target_price),
                currentPrice,
                alert.product_url
              );

              if (emailSent) {
                // Помечаем как уведомленное
                await priceTrackingService.checkAndNotify(alert.id);
                notifiedCount++;

                logger.info(`Notified ${name || email} about ${alert.product_name}`);
              } else {
                logger.warn(`Failed to send email to ${email}`);
              }
            }
          }
        } catch (error) {
          logger.error(`Error checking alert ${alert.id}:`, error);
        }
      }

      logger.info(`Price check completed. Updated: ${updatedCount}, Notified: ${notifiedCount}`);
    } catch (error) {
      logger.error('Price check job error:', error);
    } finally {
      this.isRunning = false;
    }
  }
}

export default new PriceCheckJob();
