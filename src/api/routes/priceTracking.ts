import { Router, Response } from 'express';
import priceTrackingService from '../../services/priceTracking/priceTrackingService';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import logger from '../../utils/logger';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const activeOnly = req.query.activeOnly !== 'false';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    
    const result = await priceTrackingService.getAlerts(req.userId!, activeOnly, page, limit);
    res.json(result);
  } catch (error) {
    logger.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to get price alerts' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { productId, marketplace, productName, targetPrice, currentPrice, productUrl } = req.body;

    // Валидация
    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ error: 'Valid product ID is required' });
    }
    if (!marketplace || typeof marketplace !== 'string') {
      return res.status(400).json({ error: 'Valid marketplace is required' });
    }
    if (typeof targetPrice !== 'number' || targetPrice <= 0) {
      return res.status(400).json({ error: 'Valid target price is required (must be positive)' });
    }
    if (typeof currentPrice !== 'number' || currentPrice <= 0) {
      return res.status(400).json({ error: 'Valid current price is required (must be positive)' });
    }
    if (targetPrice >= currentPrice) {
      return res.status(400).json({ error: 'Target price must be lower than current price' });
    }

    const alert = await priceTrackingService.createAlert(
      req.userId!,
      productId,
      marketplace,
      productName,
      targetPrice,
      currentPrice,
      productUrl
    );

    res.json({ alert });
  } catch (error) {
    logger.error('Create alert error:', error);
    res.status(500).json({ error: 'Failed to create price alert' });
  }
});

router.patch('/:alertId/deactivate', async (req: AuthRequest, res: Response) => {
  try {
    const alertId = Number(req.params.alertId);
    const success = await priceTrackingService.deactivateAlert(req.userId!, alertId);

    if (success) {
      res.json({ message: 'Alert deactivated' });
    } else {
      res.status(404).json({ error: 'Alert not found' });
    }
  } catch (error) {
    logger.error('Deactivate alert error:', error);
    res.status(500).json({ error: 'Failed to deactivate alert' });
  }
});

router.delete('/:alertId', async (req: AuthRequest, res: Response) => {
  try {
    const alertId = Number(req.params.alertId);
    const success = await priceTrackingService.deleteAlert(req.userId!, alertId);

    if (success) {
      res.json({ message: 'Alert deleted' });
    } else {
      res.status(404).json({ error: 'Alert not found' });
    }
  } catch (error) {
    logger.error('Delete alert error:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

export default router;
