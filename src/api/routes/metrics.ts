import { Router, Request, Response } from 'express';
import metricsService from '../../services/monitoring/metricsService';
import db from '../../config/database';
import redisClient from '../../config/redis';

const router = Router();

// Prometheus metrics endpoint
router.get('/', async (req: Request, res: Response) => {
  try {
    const metrics = metricsService.getMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  } catch (error) {
    console.error('❌ Metrics error:', error);
    res.status(500).send('Failed to get metrics');
  }
});

// JSON metrics endpoint (для удобства просмотра)
router.get('/json', async (req: Request, res: Response) => {
  try {
    const metrics = metricsService.getMetricsJSON();
    
    // Добавляем системные метрики
    const systemMetrics = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      timestamp: new Date().toISOString(),
    };

    // Проверяем состояние сервисов
    const services = {
      database: 'unknown',
      redis: 'unknown',
    };

    try {
      await db.query('SELECT 1');
      services.database = 'ok';
    } catch (e) {
      services.database = 'error';
    }

    try {
      await redisClient.ping();
      services.redis = 'ok';
    } catch (e) {
      services.redis = 'error';
    }

    res.json({
      system: systemMetrics,
      services,
      metrics,
    });
  } catch (error) {
    console.error('❌ Metrics JSON error:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

export default router;
