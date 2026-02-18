import db from '../../config/database';
import logger from '../../utils/logger';

export interface PriceAlert {
  id: number;
  user_id: number;
  product_id: string;
  marketplace: string;
  product_name: string;
  target_price: number;
  current_price: number;
  product_url: string;
  notified: boolean;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PaginatedAlerts {
  alerts: PriceAlert[];
  total: number;
  page: number;
  totalPages: number;
}

export class PriceTrackingService {
  async createAlert(
    userId: number,
    productId: string,
    marketplace: string,
    productName: string,
    targetPrice: number,
    currentPrice: number,
    productUrl: string
  ): Promise<PriceAlert> {
    try {
      // Проверка на дубликаты
      const existing = await db.query(
        `SELECT id FROM price_tracking 
         WHERE user_id = $1 AND product_id = $2 AND marketplace = $3 AND active = true`,
        [userId, productId, marketplace]
      );

      if (existing.rows.length > 0) {
        throw new Error('You are already tracking this product');
      }

      // Санитизация данных
      const sanitizedName = productName.substring(0, 500);
      const sanitizedUrl = productUrl.substring(0, 2000);
      
      const result = await db.query(
        `INSERT INTO price_tracking 
        (user_id, product_id, marketplace, product_name, target_price, current_price, product_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [userId, productId, marketplace, sanitizedName, targetPrice, currentPrice, sanitizedUrl]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Create alert error:', error);
      throw error;
    }
  }

  async getAlerts(
    userId: number, 
    activeOnly: boolean = true,
    page: number = 1,
    limit: number = 20
  ): Promise<PaginatedAlerts> {
    try {
      const offset = (page - 1) * limit;
      
      const whereClause = activeOnly
        ? 'WHERE user_id = $1 AND active = true'
        : 'WHERE user_id = $1';

      // Получаем общее количество
      const countResult = await db.query(
        `SELECT COUNT(*) FROM price_tracking ${whereClause}`,
        [userId]
      );
      const total = parseInt(countResult.rows[0].count);

      // Получаем данные с пагинацией
      const result = await db.query(
        `SELECT * FROM price_tracking ${whereClause} 
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return {
        alerts: result.rows,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Get alerts error:', error);
      throw error;
    }
  }

  async updatePrice(alertId: number, newPrice: number): Promise<void> {
    try {
      await db.query(
        'UPDATE price_tracking SET current_price = $1, updated_at = NOW() WHERE id = $2',
        [newPrice, alertId]
      );
    } catch (error) {
      logger.error('Update price error:', error);
      throw error;
    }
  }

  async checkAndNotify(alertId: number): Promise<boolean> {
    try {
      const result = await db.query(
        'SELECT * FROM price_tracking WHERE id = $1',
        [alertId]
      );

      if (result.rows.length === 0) return false;

      const alert = result.rows[0];

      if (alert.current_price <= alert.target_price && !alert.notified) {
        await db.query(
          'UPDATE price_tracking SET notified = true, updated_at = NOW() WHERE id = $1',
          [alertId]
        );

        return true;
      }

      return false;
    } catch (error) {
      logger.error('Check and notify error:', error);
      return false;
    }
  }

  async deactivateAlert(userId: number, alertId: number): Promise<boolean> {
    try {
      const result = await db.query(
        'UPDATE price_tracking SET active = false, updated_at = NOW() WHERE id = $1 AND user_id = $2',
        [alertId, userId]
      );

      return result.rowCount! > 0;
    } catch (error) {
      logger.error('Deactivate alert error:', error);
      throw error;
    }
  }

  async deleteAlert(userId: number, alertId: number): Promise<boolean> {
    try {
      const result = await db.query(
        'DELETE FROM price_tracking WHERE id = $1 AND user_id = $2',
        [alertId, userId]
      );

      return result.rowCount! > 0;
    } catch (error) {
      logger.error('Delete alert error:', error);
      throw error;
    }
  }

  async getAlertsToCheck(): Promise<PriceAlert[]> {
    try {
      const result = await db.query(
        `SELECT * FROM price_tracking 
         WHERE active = true AND notified = false
         ORDER BY updated_at ASC`
      );

      return result.rows;
    } catch (error) {
      logger.error('Get alerts to check error:', error);
      return [];
    }
  }
}

export default new PriceTrackingService();
