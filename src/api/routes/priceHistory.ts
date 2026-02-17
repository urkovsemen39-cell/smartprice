import { Router, Response } from 'express';
import priceHistoryService from '../../services/priceHistory/priceHistoryService';
import { optionalAuthMiddleware, AuthRequest } from '../../middleware/auth';

const router = Router();

router.use(optionalAuthMiddleware);

// Получить историю цен для товара
router.get('/:productId', async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.params;
    const marketplace = req.query.marketplace as string;
    const days = Number(req.query.days) || 30;

    if (!marketplace) {
      return res.status(400).json({ error: 'Marketplace parameter is required' });
    }

    if (days < 1 || days > 365) {
      return res.status(400).json({ error: 'Days must be between 1 and 365' });
    }

    const history = await priceHistoryService.getPriceHistory(productId, marketplace, days);
    res.json({ history });
  } catch (error) {
    console.error('❌ Get price history error:', error);
    res.status(500).json({ error: 'Failed to get price history' });
  }
});

// Записать текущую цену в историю (внутренний endpoint)
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { productId, marketplace, price } = req.body;

    if (!productId || !marketplace || typeof price !== 'number') {
      return res.status(400).json({ error: 'Product ID, marketplace, and price are required' });
    }

    if (price < 0) {
      return res.status(400).json({ error: 'Price must be positive' });
    }

    await priceHistoryService.recordPrice(productId, marketplace, price);
    res.json({ message: 'Price recorded' });
  } catch (error) {
    console.error('❌ Record price error:', error);
    res.status(500).json({ error: 'Failed to record price' });
  }
});

export default router;
