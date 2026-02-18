/**
 * Health Check Routes
 * Endpoints для мониторинга здоровья приложения
 */

import { Router, Request, Response } from 'express';
import { healthCheckService } from '../../services/monitoring/healthCheckService';
import { asyncHandler } from '../../utils/errors';
import { HTTP_STATUS } from '../../config/constants';

const router = Router();

/**
 * Полная проверка здоровья
 * GET /health
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const health = await healthCheckService.getFullHealth();
  
  const statusCode = health.status === 'healthy' 
    ? HTTP_STATUS.OK 
    : health.status === 'degraded'
    ? HTTP_STATUS.OK  // 200 но с предупреждением
    : HTTP_STATUS.SERVICE_UNAVAILABLE;

  res.status(statusCode).json(health);
}));

/**
 * Быстрая проверка (liveness probe)
 * GET /health/live
 * Возвращает 200 если сервер запущен, независимо от состояния зависимостей
 */
router.get('/live', asyncHandler(async (req: Request, res: Response) => {
  // Простая проверка - сервер работает
  res.status(HTTP_STATUS.OK).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}));

/**
 * Проверка готовности (readiness probe)
 * GET /health/ready
 */
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  const readiness = await healthCheckService.getReadiness();
  
  const statusCode = readiness.ready 
    ? HTTP_STATUS.OK 
    : HTTP_STATUS.SERVICE_UNAVAILABLE;

  res.status(statusCode).json(readiness);
}));

export default router;
