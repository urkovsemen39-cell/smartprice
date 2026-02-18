import { Router, Request, Response } from 'express';
import { Product } from '../../types';
import logger from '../../utils/logger';
import { UI } from '../../config/constants';

const router = Router();

// Сравнение товаров (stateless - данные приходят с клиента)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { products } = req.body;

    if (!Array.isArray(products)) {
      return res.status(400).json({ error: 'Products must be an array' });
    }

    if (products.length < 2 || products.length > UI.MAX_COMPARE_PRODUCTS) {
      return res.status(400).json({ 
        error: `You can compare 2 to ${UI.MAX_COMPARE_PRODUCTS} products` 
      });
    }

    // Валидация каждого товара
    for (const product of products) {
      if (!product.id || !product.name || typeof product.price !== 'number') {
        return res.status(400).json({ error: 'Invalid product data' });
      }
    }

    // Вычисляем сравнительные метрики
    const comparison = {
      products,
      bestPrice: products.reduce((min, p) => p.price < min.price ? p : min),
      bestRating: products.reduce((max, p) => p.rating > max.rating ? p : max),
      fastestDelivery: products.reduce((min, p) => p.deliveryDays < min.deliveryDays ? p : min),
      averagePrice: products.reduce((sum, p) => sum + p.price, 0) / products.length,
      priceRange: {
        min: Math.min(...products.map(p => p.price)),
        max: Math.max(...products.map(p => p.price)),
      },
    };

    res.json(comparison);
  } catch (error) {
    logger.error('Compare error:', error);
    res.status(500).json({ error: 'Failed to compare products' });
  }
});

export default router;
