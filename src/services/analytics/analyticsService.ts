import db from '../../config/database';
import { SearchFilters } from '../../types';

export class AnalyticsService {
  async trackClick(
    userId: number | null,
    productId: string,
    marketplace: string,
    query: string
  ): Promise<void> {
    try {
      await db.query(
        'INSERT INTO click_analytics (user_id, product_id, marketplace, query) VALUES ($1, $2, $3, $4)',
        [userId, productId, marketplace, query]
      );
    } catch (error) {
      console.error('❌ Track click error:', error);
    }
  }

  async trackSearch(userId: number | null, query: string, filters: SearchFilters | undefined, resultsCount: number): Promise<void> {
    try {
      // Валидация и санитизация
      if (typeof query !== 'string' || query.length > 500) {
        console.warn('⚠️ Invalid query for tracking');
        return;
      }

      let filtersJson = '{}';
      try {
        filtersJson = JSON.stringify(filters || {});
      } catch (e) {
        console.warn('⚠️ Failed to stringify filters');
      }

      await db.query(
        'INSERT INTO search_history (user_id, query, filters, results_count) VALUES ($1, $2, $3, $4)',
        [userId, query, filtersJson, resultsCount]
      );

      await db.query(
        `INSERT INTO popular_queries (query, search_count, last_searched)
         VALUES ($1, 1, NOW())
         ON CONFLICT (query) DO UPDATE
         SET search_count = popular_queries.search_count + 1, last_searched = NOW()`,
        [query.toLowerCase().trim()]
      );
    } catch (error) {
      console.error('❌ Track search error:', error);
    }
  }

  async getPopularQueries(limit: number = 10): Promise<string[]> {
    try {
      const result = await db.query(
        'SELECT query FROM popular_queries ORDER BY search_count DESC LIMIT $1',
        [limit]
      );

      return result.rows.map(row => row.query);
    } catch (error) {
      console.error('❌ Get popular queries error:', error);
      return [];
    }
  }

  async getUserSearchHistory(userId: number, limit: number = 20): Promise<any[]> {
    try {
      const result = await db.query(
        'SELECT query, searched_at FROM search_history WHERE user_id = $1 ORDER BY searched_at DESC LIMIT $2',
        [userId, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('❌ Get search history error:', error);
      return [];
    }
  }

  async getQueryPopularity(query: string): Promise<'popular' | 'normal' | 'rare'> {
    try {
      const result = await db.query(
        'SELECT search_count FROM popular_queries WHERE query = $1',
        [query.toLowerCase().trim()]
      );

      if (result.rows.length === 0) return 'rare';

      const count = result.rows[0].search_count;
      
      if (count >= 100) return 'popular';
      if (count >= 10) return 'normal';
      return 'rare';
    } catch (error) {
      console.error('❌ Get query popularity error:', error);
      return 'normal';
    }
  }
}

export default new AnalyticsService();
