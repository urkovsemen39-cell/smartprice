import { authService } from '../services/auth/authService';
import { pool } from '../config/database';
import logger from '../utils/logger';
import { PubSub } from 'graphql-subscriptions';

const pubsub = new PubSub();

export const resolvers = {
  Query: {
    me: async (_: any, __: any, context: any) => {
      if (!context.userId) {
        throw new Error('Not authenticated');
      }
      
      const user = await authService.getUserById(context.userId);
      return user;
    },

    search: async (_: any, { query, limit = 20, page = 1 }: any) => {
      // Simplified search - integrate with actual search service
      const offset = (page - 1) * limit;
      
      const result = await pool.query(
        `SELECT * FROM products WHERE name ILIKE $1 LIMIT $2 OFFSET $3`,
        [`%${query}%`, limit, offset]
      );

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM products WHERE name ILIKE $1`,
        [`%${query}%`]
      );

      return {
        products: result.rows,
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
      };
    },

    favorites: async (_: any, __: any, context: any) => {
      if (!context.userId) {
        throw new Error('Not authenticated');
      }

      const result = await pool.query(
        `SELECT * FROM favorites WHERE user_id = $1 ORDER BY added_at DESC`,
        [context.userId]
      );

      return result.rows.map(row => ({
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        productPrice: row.product_price,
        marketplace: row.marketplace,
        addedAt: row.added_at,
      }));
    },

    priceAlerts: async (_: any, __: any, context: any) => {
      if (!context.userId) {
        throw new Error('Not authenticated');
      }

      const result = await pool.query(
        `SELECT * FROM price_tracking WHERE user_id = $1 AND active = true ORDER BY created_at DESC`,
        [context.userId]
      );

      return result.rows.map(row => ({
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        targetPrice: row.target_price,
        currentPrice: row.current_price,
        marketplace: row.marketplace,
        active: row.active,
        createdAt: row.created_at,
      }));
    },

    suggestions: async (_: any, { query }: any) => {
      const result = await pool.query(
        `SELECT DISTINCT query FROM popular_queries 
         WHERE query ILIKE $1 
         ORDER BY search_count DESC 
         LIMIT 10`,
        [`${query}%`]
      );

      return result.rows.map(row => row.query);
    },
  },

  Mutation: {
    addFavorite: async (_: any, args: any, context: any) => {
      if (!context.userId) {
        throw new Error('Not authenticated');
      }

      const { productId, productName, productPrice, marketplace } = args;

      const result = await pool.query(
        `INSERT INTO favorites (user_id, product_id, product_name, product_price, marketplace)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, product_id) DO UPDATE SET updated_at = NOW()
         RETURNING *`,
        [context.userId, productId, productName, productPrice, marketplace]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        productPrice: row.product_price,
        marketplace: row.marketplace,
        addedAt: row.added_at,
      };
    },

    removeFavorite: async (_: any, { id }: any, context: any) => {
      if (!context.userId) {
        throw new Error('Not authenticated');
      }

      const result = await pool.query(
        `DELETE FROM favorites WHERE id = $1 AND user_id = $2`,
        [id, context.userId]
      );

      return (result.rowCount ?? 0) > 0;
    },

    createPriceAlert: async (_: any, args: any, context: any) => {
      if (!context.userId) {
        throw new Error('Not authenticated');
      }

      const { productId, productName, targetPrice, currentPrice, marketplace } = args;

      const result = await pool.query(
        `INSERT INTO price_tracking (user_id, product_id, product_name, target_price, current_price, marketplace)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [context.userId, productId, productName, targetPrice, currentPrice, marketplace]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        targetPrice: row.target_price,
        currentPrice: row.current_price,
        marketplace: row.marketplace,
        active: row.active,
        createdAt: row.created_at,
      };
    },

    deletePriceAlert: async (_: any, { id }: any, context: any) => {
      if (!context.userId) {
        throw new Error('Not authenticated');
      }

      const result = await pool.query(
        `UPDATE price_tracking SET active = false WHERE id = $1 AND user_id = $2`,
        [id, context.userId]
      );

      return (result.rowCount ?? 0) > 0;
    },

    updateProfile: async (_: any, { name }: any, context: any) => {
      if (!context.userId) {
        throw new Error('Not authenticated');
      }

      await pool.query(
        `UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2`,
        [name, context.userId]
      );

      const user = await authService.getUserById(context.userId);
      return user;
    },
  },

  Subscription: {
    priceAlertTriggered: {
      subscribe: (_: any, __: any, context: any) => {
        if (!context.userId) {
          throw new Error('Not authenticated');
        }
        return (pubsub as any).asyncIterator([`PRICE_ALERT_${context.userId}`]);
      },
    },

    productUpdated: {
      subscribe: (_: any, { productId }: any) => {
        return (pubsub as any).asyncIterator([`PRODUCT_UPDATE_${productId}`]);
      },
    },
  },
};

// Export pubsub for use in other services
export { pubsub };
