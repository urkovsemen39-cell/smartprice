import { Router, Response } from 'express';
import favoritesService from '../../services/favorites/favoritesService';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import logger from '../../utils/logger';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    
    const result = await favoritesService.getFavorites(req.userId!, page, limit);
    res.json(result);
  } catch (error) {
    logger.error('Get favorites error:', error);
    res.status(500).json({ error: 'Failed to get favorites' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const product = req.body;

    // Валидация
    if (!product.id || typeof product.id !== 'string') {
      return res.status(400).json({ error: 'Valid product id is required' });
    }
    if (!product.marketplace || typeof product.marketplace !== 'string') {
      return res.status(400).json({ error: 'Valid marketplace is required' });
    }
    if (!product.name || typeof product.name !== 'string') {
      return res.status(400).json({ error: 'Valid product name is required' });
    }
    if (typeof product.price !== 'number' || product.price < 0) {
      return res.status(400).json({ error: 'Valid product price is required' });
    }

    const favorite = await favoritesService.addFavorite(req.userId!, product);
    res.json({ favorite });
  } catch (error) {
    logger.error('Add favorite error:', error);
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

router.delete('/:productId', async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.params;
    const success = await favoritesService.removeFavorite(req.userId!, productId);

    if (success) {
      res.json({ message: 'Removed from favorites' });
    } else {
      res.status(404).json({ error: 'Favorite not found' });
    }
  } catch (error) {
    logger.error('Remove favorite error:', error);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

router.get('/check/:productId', async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.params;
    const isFavorite = await favoritesService.isFavorite(req.userId!, productId);
    res.json({ isFavorite });
  } catch (error) {
    logger.error('Check favorite error:', error);
    res.status(500).json({ error: 'Failed to check favorite' });
  }
});

export default router;
