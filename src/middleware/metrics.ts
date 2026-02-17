import { Request, Response, NextFunction } from 'express';
import metricsService from '../services/monitoring/metricsService';

// Middleware для сбора метрик HTTP запросов
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Перехватываем завершение ответа
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const route = req.route?.path || req.path;
    const method = req.method;
    const statusCode = res.statusCode;

    // Счетчик запросов
    metricsService.incrementCounter('http_requests_total', {
      method,
      route,
      status: statusCode.toString(),
    });

    // Время выполнения запроса
    metricsService.recordHistogram('http_request_duration_ms', duration, {
      method,
      route,
    });

    // Размер ответа
    const contentLength = res.get('content-length');
    if (contentLength) {
      metricsService.recordHistogram('http_response_size_bytes', parseInt(contentLength), {
        method,
        route,
      });
    }
  });

  next();
}

// Middleware для сбора метрик ошибок
export function errorMetricsMiddleware(err: any, req: Request, res: Response, next: NextFunction) {
  metricsService.incrementCounter('http_errors_total', {
    method: req.method,
    route: req.route?.path || req.path,
    error: err.name || 'UnknownError',
  });

  next(err);
}
