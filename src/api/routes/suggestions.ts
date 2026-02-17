import { Router, Request, Response } from 'express';
import cacheService from '../../services/cache/cacheService';
import analyticsService from '../../services/analytics/analyticsService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;

    if (!query || query.length < 2) {
      return res.json({ suggestions: [] });
    }

    if (query.length > 200) {
      return res.status(400).json({ error: 'Query is too long (max 200 characters)' });
    }

    const cached = await cacheService.getCachedSuggestions(query);
    if (cached) {
      return res.json({ suggestions: cached });
    }

    const popularQueries = await analyticsService.getPopularQueries(50);
    const suggestions = popularQueries
      .filter(q => q.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10);

    await cacheService.cacheSuggestions(query, suggestions);

    res.json({ suggestions });
  } catch (error) {
    console.error('❌ Suggestions error:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

export default router;
