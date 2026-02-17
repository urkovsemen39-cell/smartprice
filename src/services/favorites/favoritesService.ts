import db from '../../config/database';
import { Product } from '../../types';

export interface Favorite {
  id: number;
  user_id: number;
  product_id: string;
  marketplace: string;
  product_name: string;
  product_price: number;
  product_image: string;
  product_url: string;
  added_at: Date;
}

export interface PaginatedFavorites {
  favorites: Favorite[];
  total: number;
  page: number;
  totalPages: number;
}

export class FavoritesService {
  async addFavorite(userId: number, product: Product): Promise<Favorite> {
    try {
      // Валидация URL
      if (!this.isValidUrl(product.url)) {
        throw new Error('Invalid product URL');
      }

      // Санитизация данных
      const sanitizedName = product.name.substring(0, 500);
      const sanitizedUrl = product.url.substring(0, 2000);
      const sanitizedImage = product.image.substring(0, 2000);
      
      const result = await db.query(
        `INSERT INTO favorites 
        (user_id, product_id, marketplace, product_name, product_price, product_image, product_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id, product_id) DO UPDATE
        SET product_price = $5, updated_at = NOW()
        RETURNING *`,
        [
          userId,
          product.id,
          product.marketplace,
          sanitizedName,
          product.price,
          sanitizedImage,
          sanitizedUrl,
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('❌ Add favorite error:', error);
      throw error;
    }
  }

  async removeFavorite(userId: number, productId: string): Promise<boolean> {
    try {
      const result = await db.query(
        'DELETE FROM favorites WHERE user_id = $1 AND product_id = $2',
        [userId, productId]
      );

      return result.rowCount! > 0;
    } catch (error) {
      console.error('❌ Remove favorite error:', error);
      throw error;
    }
  }

  async getFavorites(userId: number, page: number = 1, limit: number = 20): Promise<PaginatedFavorites> {
    try {
      const offset = (page - 1) * limit;

      // Получаем общее количество
      const countResult = await db.query(
        'SELECT COUNT(*) FROM favorites WHERE user_id = $1',
        [userId]
      );
      const total = parseInt(countResult.rows[0].count);

      // Получаем данные с пагинацией
      const result = await db.query(
        'SELECT * FROM favorites WHERE user_id = $1 ORDER BY added_at DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );

      return {
        favorites: result.rows,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('❌ Get favorites error:', error);
      throw error;
    }
  }

  async isFavorite(userId: number, productId: string): Promise<boolean> {
    try {
      const result = await db.query(
        'SELECT id FROM favorites WHERE user_id = $1 AND product_id = $2',
        [userId, productId]
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error('❌ Check favorite error:', error);
      return false;
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

export default new FavoritesService();
