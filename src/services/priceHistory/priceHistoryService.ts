import db from '../../config/database';

export interface PriceHistoryEntry {
  id: number;
  product_id: string;
  marketplace: string;
  price: number;
  recorded_at: Date;
}

export class PriceHistoryService {
  async recordPrice(productId: string, marketplace: string, price: number): Promise<void> {
    try {
      await db.query(
        'INSERT INTO price_history (product_id, marketplace, price) VALUES ($1, $2, $3)',
        [productId, marketplace, price]
      );
    } catch (error) {
      console.error('❌ Record price error:', error);
      throw error;
    }
  }

  async getPriceHistory(
    productId: string,
    marketplace: string,
    days: number = 30
  ): Promise<PriceHistoryEntry[]> {
    try {
      const result = await db.query(
        `SELECT * FROM price_history 
         WHERE product_id = $1 AND marketplace = $2 
         AND recorded_at >= NOW() - INTERVAL '${days} days'
         ORDER BY recorded_at ASC`,
        [productId, marketplace]
      );

      return result.rows;
    } catch (error) {
      console.error('❌ Get price history error:', error);
      throw error;
    }
  }

  async getLatestPrice(productId: string, marketplace: string): Promise<number | null> {
    try {
      const result = await db.query(
        `SELECT price FROM price_history 
         WHERE product_id = $1 AND marketplace = $2 
         ORDER BY recorded_at DESC LIMIT 1`,
        [productId, marketplace]
      );

      return result.rows.length > 0 ? Number(result.rows[0].price) : null;
    } catch (error) {
      console.error('❌ Get latest price error:', error);
      return null;
    }
  }

  async cleanOldHistory(daysToKeep: number = 365): Promise<number> {
    try {
      const result = await db.query(
        `DELETE FROM price_history 
         WHERE recorded_at < NOW() - INTERVAL '${daysToKeep} days'`
      );

      return result.rowCount || 0;
    } catch (error) {
      console.error('❌ Clean old history error:', error);
      return 0;
    }
  }
}

export default new PriceHistoryService();
