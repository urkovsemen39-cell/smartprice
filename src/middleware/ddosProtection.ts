import { Request, Response, NextFunction } from 'express';
import ddosProtectionService from '../services/security/ddosProtectionService';
import intrusionPreventionService from '../services/security/intrusionPreventionService';

/**
 * DDoS Protection Middleware
 */
export const ddosProtection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const endpoint = req.path;

    // Регистрация активного IP
    await ddosProtectionService.registerActiveIP(ip);

    // Проверка на заблокированный IP
    const isBlocked = await intrusionPreventionService.isIPBlocked(ip);
    if (isBlocked) {
      return res.status(403).json({
        error: 'Your IP address has been blocked due to suspicious activity',
        code: 'IP_BLOCKED'
      });
    }

    // Проверка аварийного режима
    const isEmergency = await ddosProtectionService.isEmergencyMode();
    if (isEmergency) {
      // В аварийном режиме пропускаем только критичные запросы
      const criticalEndpoints = ['/api/health', '/api/auth/login'];
      if (!criticalEndpoints.includes(endpoint)) {
        return res.status(503).json({
          error: 'Service temporarily unavailable due to high load',
          code: 'EMERGENCY_MODE',
          retryAfter: 60
        });
      }
    }

    // Проверка на DDoS атаку
    const isDDoS = await ddosProtectionService.checkForDDoS(ip, endpoint);
    if (isDDoS) {
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        code: 'DDOS_DETECTED',
        retryAfter: 60
      });
    }

    // Проверка, требуется ли challenge
    const requiresChallenge = await ddosProtectionService.requireChallenge(ip);
    if (requiresChallenge && !req.headers['x-challenge-response']) {
      const challenge = await ddosProtectionService.generateChallenge(ip);
      return res.status(403).json({
        error: 'Challenge required',
        code: 'CHALLENGE_REQUIRED',
        challenge
      });
    }

    // Проверка challenge response
    if (req.headers['x-challenge-response']) {
      const verified = await ddosProtectionService.verifyChallenge(
        ip,
        req.headers['x-challenge-response'] as string
      );
      
      if (!verified) {
        return res.status(403).json({
          error: 'Invalid challenge response',
          code: 'INVALID_CHALLENGE'
        });
      }
    }

    // Adaptive rate limiting
    const rateLimit = await ddosProtectionService.getAdaptiveRateLimit(ip);
    
    // Применение rate limit (упрощенная версия)
    // В production использовать express-rate-limit с Redis store
    
    next();
  } catch (error) {
    console.error('DDoS protection middleware error:', error);
    next(); // Не блокируем запрос при ошибке middleware
  }
};

/**
 * Geo-blocking Middleware
 */
export const geoBlocking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Получение страны из заголовка (Cloudflare добавляет CF-IPCountry)
    const countryCode = req.headers['cf-ipcountry'] as string;

    if (countryCode) {
      const isBlocked = await ddosProtectionService.isCountryBlocked(countryCode);
      
      if (isBlocked) {
        return res.status(403).json({
          error: 'Access from your country is currently restricted',
          code: 'GEO_BLOCKED',
          country: countryCode
        });
      }
    }

    next();
  } catch (error) {
    console.error('Geo-blocking middleware error:', error);
    next();
  }
};
