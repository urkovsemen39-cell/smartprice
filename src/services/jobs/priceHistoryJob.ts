import priceHistoryService from '../priceHistory/priceHistoryService';
import db from '../../config/database';

export class PriceHistoryJob {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  start(intervalHours: number = 24) {
    if (this.intervalId) {
      console.log('⚠️ Price history job already running');
      return;
    }

    console.log(`✅ Starting price history collection job (every ${intervalHours} hours)`);
    
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
      console.log('✅ Price history job stopped');
    }
  }

  private async collectPriceHistory() {
    if (this.isRunning) {
      console.log('⚠️ Price history collection already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('📊 Starting price history collection...');

    try {
      // Получаем все уникальные товары из отслеживания цен
      const result = await db.query(`
        SELECT DISTINCT product_id, marketplace, current_price, product_name
        FROM price_tracking
        WHERE active = true
      `);

      const products = result.rows;
      console.log(`📦 Collecting history for ${products.length} products`);

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
          await priceHistoryService.recordPrice(
            product.product_id,
            product.marketplace,
            currentPrice
          );

          collectedCount++;
        } catch (error) {
          console.error(`❌ Error collecting history for ${product.product_id}:`, error);
        }
      }

      console.log(`✅ Price history collection completed. Collected: ${collectedCount}`);

      // Очистка старых записей (старше 1 года)
      const deletedCount = await priceHistoryService.cleanOldHistory(365);
      if (deletedCount > 0) {
        console.log(`🗑️ Cleaned ${deletedCount} old price history records`);
      }
    } catch (error) {
      console.error('❌ Price history collection error:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // Метод для ручного запуска сбора
  async collectNow(): Promise<void> {
    await this.collectPriceHistory();
  }
}

export default new PriceHistoryJob();
