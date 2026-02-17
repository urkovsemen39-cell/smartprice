import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../config/redis';
import { apiKeyService } from '../services/auth/apiKeyService';
import crypto from 'crypto';

// Конфигурация rate limits для разных эндпоинтов
const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, max: 5 },           // 5 req/15min
  search: { windowMs: 60 * 1000, max: 100 },            // 100 req/min
  suggestions: { windowMs: 60 * 1000, max: 30 },        // 30 req/min
  api: { windowMs: 60 * 1000, max: 60 },                // 60 req/min
  authenticated: { windowMs: 60 * 1000, max: 200 },     // 200 req/min для auth users
};

// Whitelist IP адресов (для администраторов)
const IP_WHITELIST = new Set(
  (process.env.IP_WHITELIST || '').split(',').filter(ip => ip.trim())
);

/**
 * Продвинутый rate limiting с динамическими лимитами
 */
export function advancedRateLimitMiddleware(endpoint: keyof typeof RATE_LIMITS) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                 req.socket.remoteAddress || 
                 'unknown';

      // Проверка whitelist
      if (IP_WHITELIST.has(ip)) {
        return next();
      }

      // Получение лимитов
      let limits = RATE_LIMITS[endpoint];
      
      // Более высокие лимиты для аутентифицированных пользователей
      const isAuthenticated = (req as any).user !== undefined;
      if (isAuthenticated && endpoint !== 'auth') {
        limits = RATE_LIMITS.authenticated;
      }

      // Проверка подозрительной активности
      const suspiciousKey = `suspicious_activity:${ip}`;
      const isSuspicious = await redisClient.get(suspiciousKey);
      
      if (isSuspicious) {
        // Снижаем лимиты на 50% для подозрительных IP
        limits = {
          ...limits,
          max: Math.floor(limits.max * 0.5),
        };
      }

      // Ключ для rate limiting
      const key = `rate_limit:${endpoint}:${ip}`;
      const windowSeconds = Math.floor(limits.windowMs / 1000);

      const requests = await redisClient.incr(key);

      if (requests === 1) {
        await redisClient.expire(key, windowSeconds);
      }

      if (requests > limits.max) {
        const ttl = await redisClient.ttl(key);
        
        console.warn(`⚠️ Rate limit exceeded for ${endpoint} from IP ${ip}: ${requests}/${limits.max}`);
        
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: ttl,
          limit: limits.max,
          current: requests,
        });
      }

      // Заголовки для клиента
      res.setHeader('X-RateLimit-Limit', limits.max.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limits.max - requests).toString());
      res.setHeader('X-RateLimit-Reset', windowSeconds.toString());

      next();
    } catch (error) {
      console.error('❌ Advanced rate limit middleware error:', error);
      next(); // Fail open
    }
  };
}

/**
 * Middleware для проверки API ключей
 */
export async function apiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    // Валидация ключа
    const validation = await apiKeyService.validateKey(apiKey);

    if (!validation.valid) {
      return res.status(401).json({ error: 'Invalid or expired API key' });
    }

    // Проверка rate limit для ключа
    const canProceed = await apiKeyService.checkRateLimit(validation.keyId!);

    if (!canProceed) {
      return res.status(429).json({ 
        error: 'API key rate limit exceeded',
        limit: 1000,
        window: '1 hour',
      });
    }

    // Добавление информации о пользователе в request
    (req as any).user = { userId: validation.userId };
    (req as any).apiKeyId = validation.keyId;

    next();
  } catch (error) {
    console.error('❌ API key middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Content Security Policy middleware
 */
export function cspMiddleware(req: Request, res: Response, next: NextFunction) {
  // Генерация nonce для inline scripts
  const nonce = crypto.randomBytes(16).toString('base64');
  (req as any).nonce = nonce;

  const cspDirectives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https:`,
    `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}`,
    `font-src 'self'`,
    `object-src 'none'`,
    `media-src 'self'`,
    `frame-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ];

  // В production добавляем report-uri
  if (process.env.NODE_ENV === 'production') {
    cspDirectives.push(`report-uri /api/csp-report`);
  }

  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
  next();
}

/**
 * Endpoint для приема CSP violation reports
 */
export async function cspReportHandler(req: Request, res: Response) {
  try {
    const report = req.body['csp-report'];

    if (report) {
      console.warn('⚠️ CSP Violation:', {
        documentUri: report['document-uri'],
        violatedDirective: report['violated-directive'],
        blockedUri: report['blocked-uri'],
        sourceFile: report['source-file'],
        lineNumber: report['line-number'],
      });

      // Сохранение в БД (опционально)
      // await pool.query(
      //   `INSERT INTO csp_violations (...) VALUES (...)`,
      //   [...]
      // );
    }

    res.status(204).end();
  } catch (error) {
    console.error('❌ CSP report handler error:', error);
    res.status(500).end();
  }
}

/**
 * Middleware для логирования использования API ключа
 */
export function apiKeyLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const startTime = Date.now();
  const apiKeyId = (req as any).apiKeyId;

  if (!apiKeyId) {
    return next();
  }

  // Логирование после завершения запроса
  res.on('finish', async () => {
    const responseTime = Date.now() - startTime;
    
    try {
      await apiKeyService.logUsage(
        apiKeyId,
        req.path,
        req.method,
        res.statusCode,
        responseTime
      );
    } catch (error) {
      console.error('❌ Error logging API key usage:', error);
    }
  });

  next();
}

/**
 * Middleware для проверки email верификации
 */
export function requireEmailVerification(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Проверка верификации (предполагается, что информация есть в токене)
  if (!user.emailVerified) {
    return res.status(403).json({ 
      error: 'Email verification required',
      message: 'Please verify your email address to access this feature',
    });
  }

  next();
}

export default {
  advancedRateLimitMiddleware,
  apiKeyMiddleware,
  cspMiddleware,
  cspReportHandler,
  apiKeyLoggingMiddleware,
  requireEmailVerification,
};
