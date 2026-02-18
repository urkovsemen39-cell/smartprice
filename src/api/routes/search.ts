import { Router, Response } from 'express';
import { searchProducts } from '../../services/search/searchService';
import { SearchParams } from '../../types';
import { optionalAuthMiddleware, AuthRequest } from '../../middleware/auth';
import logger from '../../utils/logger';

const router = Router();

router.use(optionalAuthMiddleware);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const query = req.query.q as string;
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Query parameter "q" is required' 
      });
    }

    if (query.length > 200) {
      return res.status(400).json({ 
        error: 'Query is too long (max 200 characters)' 
      });
    }

    const params: SearchParams = {
      query: query.trim(),
      filters: {
        minPrice: req.query.minPrice ? Math.max(0, Number(req.query.minPrice)) : undefined,
        maxPrice: req.query.maxPrice ? Math.max(0, Number(req.query.maxPrice)) : undefined,
        minRating: req.query.minRating ? Math.max(0, Math.min(5, Number(req.query.minRating))) : undefined,
        freeDelivery: req.query.freeDelivery === 'true',
        inStockOnly: req.query.inStockOnly === 'true',
      },
      sort: (req.query.sort as any) || 'smart',
      page: req.query.page ? Math.max(1, Number(req.query.page)) : 1,
      limit: req.query.limit ? Math.max(1, Math.min(100, Number(req.query.limit))) : 20,
    };
    
    const result = await searchProducts(params, req.userId);
    
    res.json(result);
  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
