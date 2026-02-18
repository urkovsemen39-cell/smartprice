import { Router, Response } from 'express';
import analyticsService from '../../services/analytics/analyticsService';
import { authMiddleware, optionalAuthMiddleware, AuthRequest } from '../../middleware/auth';
import logger from '../../utils/logger';

const router = Router();

router.post('/click', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { productId, marketplace, query } = req.body;

    if (!productId || !marketplace) {
      return res.status(400).json({ error: 'Product ID and marketplace are required' });
    }

    await analyticsService.trackClick(req.userId || null, productId, marketplace, query);
    res.json({ message: 'Click tracked' });
  } catch (error) {
    logger.error('Track click error:', error);
    res.status(500).json({ error: 'Failed to track click' });
  }
});

router.get('/popular-queries', async (req, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const queries = await analyticsService.getPopularQueries(limit);
    res.json({ queries });
  } catch (error) {
    logger.error('Get popular queries error:', error);
    res.status(500).json({ error: 'Failed to get popular queries' });
  }
});

router.get('/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const history = await analyticsService.getUserSearchHistory(req.userId!, limit);
    res.json({ history });
  } catch (error) {
    logger.error('Get search history error:', error);
    res.status(500).json({ error: 'Failed to get search history' });
  }
});

export default router;
