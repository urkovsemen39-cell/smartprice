import { Router, Request, Response } from 'express';
import { pool } from '../../config/database';
import logger from '../../utils/logger';

const router = Router();

/**
 * Get environment features configuration
 */
router.get('/environment', (_req: Request, res: Response) => {
  res.json({
    features: {
      emailVerification: true,
      twoFactorAuth: true,
      apiKeys: true,
      priceTracking: true,
      favorites: true,
      analytics: true,
      security: true,
    },
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
  });
});

/**
 * Clear IP blocks (admin only - temporary for debugging)
 */
router.post('/clear-ip-blocks', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM ip_blacklist RETURNING *');
    res.json({
      message: 'IP blocks cleared',
      count: result.rowCount,
    });
  } catch (error: any) {
    logger.error('Clear IP blocks error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
