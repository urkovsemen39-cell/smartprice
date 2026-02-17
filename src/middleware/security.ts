import { Request, Response, NextFunction } from 'express';
import redisClient from '../config/redis';

const MAX_REQUESTS_PER_IP = 1000; // Максимум запросов с одного IP в час
const WINDOW_SIZE = 60 * 60; // 1 час в секундах

const SUSPICIOUS_PATTERNS = [
  /(\.\.|\/\/)/,           // Path traversal
  /<script/i,              // XSS attempts
  /union.*select/i,        // SQL injection
  /exec\s*\(/i,            // Code execution
  /eval\s*\(/i,            // Code execution
];

/**
 * Middleware для защиты от IP-based атак
 */
export async function ipRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    const key = `ip_requests:${ip}`;

    const requests = await redisClient.incr(key);

    if (requests === 1) {
      await redisClient.expire(key, WINDOW_SIZE);
    }

    if (requests > MAX_REQUESTS_PER_IP) {
      console.warn(`⚠️ IP ${ip} exceeded rate limit: ${requests} requests`);
      return res.status(429).json({
        error: 'Too many requests from this IP address. Please try again later.',
      });
    }

    // Добавляем заголовки для информирования клиента
    res.setHeader('X-RateLimit-Limit', MAX_REQUESTS_PER_IP.toString());
    res.setHeader('X-RateLimit-Remaining', (MAX_REQUESTS_PER_IP - requests).toString());

    next();
  } catch (error) {
    console.error('❌ IP rate limit middleware error:', error);
    // В случае ошибки пропускаем запрос (fail open)
    next();
  }
}

/**
 * Middleware для обнаружения подозрительных паттернов в запросах
 */
export function suspiciousPatternMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const url = req.url;
    const body = JSON.stringify(req.body);
    const query = JSON.stringify(req.query);

    const content = `${url} ${body} ${query}`;

    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(content)) {
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
        console.warn(`⚠️ Suspicious pattern detected from IP ${ip}: ${pattern}`);
        
        // Логируем подозрительную активность
        logSuspiciousActivity(ip || 'unknown', req.method, url, pattern.toString());

        return res.status(400).json({
          error: 'Invalid request',
        });
      }
    }

    next();
  } catch (error) {
    console.error('❌ Suspicious pattern middleware error:', error);
    next();
  }
}

/**
 * Логирование подозрительной активности
 */
async function logSuspiciousActivity(
  ip: string,
  method: string,
  url: string,
  pattern: string
) {
  try {
    const key = `suspicious_activity:${ip}`;
    const data = {
      timestamp: new Date().toISOString(),
      method,
      url,
      pattern,
    };

    await redisClient.lPush(key, JSON.stringify(data));
    await redisClient.lTrim(key, 0, 99); // Храним последние 100 записей
    await redisClient.expire(key, 7 * 24 * 60 * 60); // 7 дней
  } catch (error) {
    console.error('❌ Failed to log suspicious activity:', error);
  }
}

/**
 * Middleware для защиты от CSRF (проверка origin)
 */
export function csrfProtectionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Пропускаем GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean);

  // Проверяем origin
  if (origin) {
    const isAllowed = allowedOrigins.some(allowed => origin.startsWith(allowed || ''));
    if (!isAllowed) {
      console.warn(`⚠️ CSRF attempt detected: origin ${origin}`);
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  next();
}

/**
 * Middleware для добавления security headers
 */
export function securityHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Защита от clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Защита от MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  );

  // HSTS (только для production)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}
