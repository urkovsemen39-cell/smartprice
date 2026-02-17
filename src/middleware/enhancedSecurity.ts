import { Request, Response, NextFunction } from 'express';
import intrusionPreventionService from '../services/security/intrusionPreventionService';
import anomalyDetectionService from '../services/security/anomalyDetectionService';

/**
 * Input Validation & Sanitization Middleware
 */
export const inputValidation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    // Проверка всех входных данных на атаки
    const inputs = [
      req.url,
      JSON.stringify(req.query),
      JSON.stringify(req.body),
      JSON.stringify(req.params)
    ];

    for (const input of inputs) {
      // SQL Injection
      if (intrusionPreventionService.detectSQLInjection(input, ip)) {
        return res.status(403).json({
          error: 'Malicious input detected',
          code: 'SQL_INJECTION_DETECTED'
        });
      }

      // XSS
      if (intrusionPreventionService.detectXSS(input, ip)) {
        return res.status(403).json({
          error: 'Malicious input detected',
          code: 'XSS_DETECTED'
        });
      }

      // Path Traversal
      if (intrusionPreventionService.detectPathTraversal(input, ip)) {
        return res.status(403).json({
          error: 'Malicious input detected',
          code: 'PATH_TRAVERSAL_DETECTED'
        });
      }

      // Command Injection
      if (intrusionPreventionService.detectCommandInjection(input, ip)) {
        return res.status(403).json({
          error: 'Malicious input detected',
          code: 'COMMAND_INJECTION_DETECTED'
        });
      }

      // LDAP Injection
      if (intrusionPreventionService.detectLDAPInjection(input, ip)) {
        return res.status(403).json({
          error: 'Malicious input detected',
          code: 'LDAP_INJECTION_DETECTED'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Input validation middleware error:', error);
    next();
  }
};

/**
 * Anomaly Detection Middleware
 */
export const anomalyDetection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Только для аутентифицированных пользователей
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const endpoint = req.path;

    // Обнаружение аномалий
    const anomalyScore = await anomalyDetectionService.detectAnomalies(
      userId,
      ip,
      userAgent,
      endpoint
    );

    if (anomalyScore.shouldBlock) {
      return res.status(403).json({
        error: 'Suspicious activity detected. Your account has been temporarily locked.',
        code: 'ANOMALY_DETECTED',
        details: 'Please contact support to unlock your account.'
      });
    }

    // Добавление score в request для логирования
    (req as any).anomalyScore = anomalyScore;

    next();
  } catch (error) {
    console.error('Anomaly detection middleware error:', error);
    next();
  }
};

/**
 * Bot Detection Middleware
 */
export const botDetection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const isBot = await anomalyDetectionService.detectBotActivity(ip, userAgent);

    if (isBot) {
      // Можно либо блокировать, либо применять более строгие rate limits
      return res.status(403).json({
        error: 'Bot activity detected',
        code: 'BOT_DETECTED'
      });
    }

    next();
  } catch (error) {
    console.error('Bot detection middleware error:', error);
    next();
  }
};

/**
 * Credential Stuffing Detection Middleware
 */
export const credentialStuffingDetection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Только для login endpoint
    if (!req.path.includes('/login')) {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const email = req.body.email;

    if (email) {
      // Регистрация попытки входа
      await anomalyDetectionService.registerLoginAttempt(ip, email);

      // Проверка на credential stuffing
      const isCredentialStuffing = await anomalyDetectionService.detectCredentialStuffing(ip);

      if (isCredentialStuffing) {
        // Блокировка IP
        await intrusionPreventionService.blockIP(ip, 'credential_stuffing', 3600);

        return res.status(429).json({
          error: 'Too many login attempts from your IP',
          code: 'CREDENTIAL_STUFFING_DETECTED'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Credential stuffing detection error:', error);
    next();
  }
};

/**
 * Account Takeover Detection Middleware
 */
export const accountTakeoverDetection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Только для аутентифицированных пользователей
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const isTakeover = await anomalyDetectionService.detectAccountTakeover(userId, ip, userAgent);

    if (isTakeover) {
      // Завершение всех сессий и требование повторного входа
      return res.status(403).json({
        error: 'Suspicious account activity detected. Please log in again.',
        code: 'ACCOUNT_TAKEOVER_SUSPECTED'
      });
    }

    next();
  } catch (error) {
    console.error('Account takeover detection error:', error);
    next();
  }
};

/**
 * Threat Score Middleware
 */
export const threatScoreCheck = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    const threatScore = await intrusionPreventionService.calculateThreatScore(ip);

    if (threatScore.blocked) {
      return res.status(403).json({
        error: 'Access denied due to high threat score',
        code: 'HIGH_THREAT_SCORE',
        score: threatScore.score
      });
    }

    // Добавление threat score в request
    (req as any).threatScore = threatScore;

    next();
  } catch (error) {
    console.error('Threat score check error:', error);
    next();
  }
};
