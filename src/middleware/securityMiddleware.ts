import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../config/redis';
import { apiKeyService } from '../services/auth/apiKeyService';
import intrusionPreventionService from '../services/security/intrusionPreventionService';
import anomalyDetectionService from '../services/security/anomalyDetectionService';
import { RATE_LIMITS } from '../config/constants';
import { getClientIp } from '../utils/ip';
import { safeRedisGet, safeRedisIncr, safeRedisExpire, safeRedisTtl } from '../utils/safeRedis';
import crypto from 'crypto';
import env from '../config/env';
import logger from '../utils/logger';

// IP Whitelist
const IP_WHITELIST = new Set(
  (process.env.IP_WHITELIST || '').split(',').filter(ip => ip.trim())
);

/**
 * Basic Security Headers
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  if (env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
}

/**
 * Content Security Policy
 */
export function csp(req: Request, res: Response, next: NextFunction) {
  const nonce = crypto.randomBytes(16).toString('base64');
  (req as any).nonce = nonce;

  const cspDirectives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https:`,
    `connect-src 'self' ${env.FRONTEND_URL}`,
    `font-src 'self'`,
    `object-src 'none'`,
    `media-src 'self'`,
    `frame-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ];

  if (env.NODE_ENV === 'production') {
    cspDirectives.push(`upgrade-insecure-requests`);
    cspDirectives.push(`report-uri /api/csp-report`);
  }

  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
  next();
}

/**
 * CSRF Protection
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const origin = req.headers.origin;
  const allowedOrigins = [
    env.FRONTEND_URL,
    ...(env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:3001'] : [])
  ].filter(Boolean);

  if (origin && !allowedOrigins.includes(origin)) {
    logger.warn(`CSRF blocked origin: ${origin}`);
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
}

/**
 * Global IP Rate Limiting
 */
export async function ipRateLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = getClientIp(req);
    const key = `ip_requests:${ip}`;
    const windowSize = Math.floor(RATE_LIMITS.GLOBAL_IP.windowMs / 1000);

    const requests = await safeRedisIncr(key);

    if (requests === 1) {
      await safeRedisExpire(key, windowSize);
    }

    if (requests > RATE_LIMITS.GLOBAL_IP.max) {
      logger.warn(`IP rate limit exceeded: ${ip} (${requests} requests)`);
      return res.status(429).json({
        error: 'Too many requests from this IP address',
      });
    }

    res.setHeader('X-RateLimit-Limit', RATE_LIMITS.GLOBAL_IP.max.toString());
    res.setHeader('X-RateLimit-Remaining', (RATE_LIMITS.GLOBAL_IP.max - requests).toString());

    next();
  } catch (error) {
    logger.error('IP rate limit error:', error);
    next();
  }
}

/**
 * Advanced Rate Limiting per Endpoint
 */
export function endpointRateLimit(endpoint: keyof typeof RATE_LIMITS) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = getClientIp(req);

      if (IP_WHITELIST.has(ip)) {
        return next();
      }

      let limits = RATE_LIMITS[endpoint];
      
      const isAuthenticated = (req as any).user !== undefined;
      if (isAuthenticated && endpoint !== 'AUTH') {
        limits = RATE_LIMITS.AUTHENTICATED;
      }

      const suspiciousKey = `suspicious_activity:${ip}`;
      const isSuspicious = await safeRedisGet(suspiciousKey);
      
      if (isSuspicious) {
        limits = {
          windowMs: limits.windowMs,
          max: Math.floor(limits.max * 0.5) as any,
        };
      }

      const key = `rate_limit:${endpoint}:${ip}`;
      const windowSeconds = Math.floor(limits.windowMs / 1000);

      const requests = await safeRedisIncr(key);

      if (requests === 1) {
        await safeRedisExpire(key, windowSeconds);
      }

      if (requests > limits.max) {
        const ttl = await safeRedisTtl(key);
        
        logger.warn(`Rate limit exceeded: ${endpoint} from ${ip} (${requests}/${limits.max})`);
        
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: ttl,
        });
      }

      res.setHeader('X-RateLimit-Limit', limits.max.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limits.max - requests).toString());

      next();
    } catch (error) {
      logger.error('Endpoint rate limit error:', error);
      next();
    }
  };
}

/**
 * Input Validation & Sanitization
 */
export async function inputValidation(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = getClientIp(req);

    const inputs = [
      req.url,
      JSON.stringify(req.query),
      JSON.stringify(req.body),
      JSON.stringify(req.params)
    ];

    for (const input of inputs) {
      if (intrusionPreventionService.detectSQLInjection(input, ip)) {
        return res.status(403).json({
          error: 'Malicious input detected',
          code: 'SQL_INJECTION'
        });
      }

      if (intrusionPreventionService.detectXSS(input, ip)) {
        return res.status(403).json({
          error: 'Malicious input detected',
          code: 'XSS'
        });
      }

      if (intrusionPreventionService.detectPathTraversal(input, ip)) {
        return res.status(403).json({
          error: 'Malicious input detected',
          code: 'PATH_TRAVERSAL'
        });
      }

      if (intrusionPreventionService.detectCommandInjection(input, ip)) {
        return res.status(403).json({
          error: 'Malicious input detected',
          code: 'COMMAND_INJECTION'
        });
      }
    }

    next();
  } catch (error) {
    logger.error('Input validation error:', error);
    next();
  }
}

/**
 * Anomaly Detection
 */
export async function anomalyDetection(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const endpoint = req.path;

    const anomalyScore = await anomalyDetectionService.detectAnomalies(
      userId,
      ip,
      userAgent,
      endpoint
    );

    if (anomalyScore.shouldBlock) {
      return res.status(403).json({
        error: 'Suspicious activity detected',
        code: 'ANOMALY_DETECTED'
      });
    }

    (req as any).anomalyScore = anomalyScore;
    next();
  } catch (error) {
    logger.error('Anomaly detection error:', error);
    next();
  }
}

/**
 * Bot Detection
 */
export async function botDetection(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    const isBot = await anomalyDetectionService.detectBotActivity(ip, userAgent);

    if (isBot) {
      return res.status(403).json({
        error: 'Bot activity detected',
        code: 'BOT_DETECTED'
      });
    }

    next();
  } catch (error) {
    logger.error('Bot detection error:', error);
    next();
  }
}

/**
 * Credential Stuffing Detection
 */
export async function credentialStuffingDetection(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.path.includes('/login')) {
      return next();
    }

    const ip = getClientIp(req);
    const email = req.body.email;

    if (email) {
      await anomalyDetectionService.registerLoginAttempt(ip, email);

      const isCredentialStuffing = await anomalyDetectionService.detectCredentialStuffing(ip);

      if (isCredentialStuffing) {
        await intrusionPreventionService.blockIP(ip, 'credential_stuffing', 3600);

        return res.status(429).json({
          error: 'Too many login attempts',
          code: 'CREDENTIAL_STUFFING'
        });
      }
    }

    next();
  } catch (error) {
    logger.error('Credential stuffing detection error:', error);
    next();
  }
}

/**
 * API Key Authentication
 */
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const validation = await apiKeyService.validateKey(apiKey);

    if (!validation.valid) {
      return res.status(401).json({ error: 'Invalid or expired API key' });
    }

    const canProceed = await apiKeyService.checkRateLimit(validation.keyId!);

    if (!canProceed) {
      return res.status(429).json({ 
        error: 'API key rate limit exceeded'
      });
    }

    (req as any).user = { userId: validation.userId };
    (req as any).apiKeyId = validation.keyId;

    next();
  } catch (error) {
    logger.error('API key auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Require Email Verification
 */
export function requireEmailVerification(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!user.emailVerified) {
    return res.status(403).json({ 
      error: 'Email verification required'
    });
  }

  next();
}

/**
 * Threat Score Check
 */
export async function threatScoreCheck(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = getClientIp(req);

    const threatScore = await intrusionPreventionService.calculateThreatScore(ip);

    if (threatScore.blocked) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'HIGH_THREAT_SCORE'
      });
    }

    (req as any).threatScore = threatScore;
    next();
  } catch (error) {
    logger.error('Threat score check error:', error);
    next();
  }
}

/**
 * CSP Violation Report Handler
 */
export async function cspReportHandler(req: Request, res: Response) {
  try {
    const report = req.body['csp-report'];

    if (report) {
      logger.warn('CSP Violation:', {
        documentUri: report['document-uri'],
        violatedDirective: report['violated-directive'],
        blockedUri: report['blocked-uri'],
      });
    }

    res.status(204).end();
  } catch (error) {
    logger.error('CSP report handler error:', error);
    res.status(500).end();
  }
}

export default {
  securityHeaders,
  csp,
  csrfProtection,
  ipRateLimit,
  endpointRateLimit,
  inputValidation,
  anomalyDetection,
  botDetection,
  credentialStuffingDetection,
  apiKeyAuth,
  requireEmailVerification,
  threatScoreCheck,
  cspReportHandler,
};
