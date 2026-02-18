import { Request } from 'express';
import { redisClient } from '../../config/redis';
import { auditService } from '../audit/auditService';
import intrusionPreventionService from './intrusionPreventionService';

interface DDoSMetrics {
  requestsPerSecond: number;
  uniqueIPs: number;
  suspiciousPatterns: string[];
  threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  blockDuration: number;
}

class DDoSProtectionService {
  private readonly WINDOW_SIZE = 60; // 60 секунд
  private readonly SUSPICIOUS_THRESHOLD = 1000; // запросов в минуту с одного IP
  private readonly GLOBAL_THRESHOLD = 50000; // общих запросов в минуту

  /**
   * Проверка на DDoS атаку
   */
  async checkForDDoS(ip: string, endpoint: string): Promise<boolean> {
    // Проверка rate limit для конкретного IP
    const ipRateLimit = await this.checkIPRateLimit(ip);
    if (!ipRateLimit.allowed) {
      await this.recordDDoSAttempt(ip, 'ip_rate_limit_exceeded', ipRateLimit.current);
      return true;
    }

    // Проверка глобального rate limit
    const globalRateLimit = await this.checkGlobalRateLimit();
    if (!globalRateLimit.allowed) {
      await this.recordDDoSAttempt(ip, 'global_rate_limit_exceeded', globalRateLimit.current);
      return true;
    }

    // Проверка паттернов DDoS
    const isDDoS = await this.detectDDoSPatterns(ip, endpoint);
    if (isDDoS) {
      await this.recordDDoSAttempt(ip, 'ddos_pattern_detected', 0);
      return true;
    }

    return false;
  }

  /**
   * Проверка rate limit для IP
   */
  private async checkIPRateLimit(ip: string): Promise<{ allowed: boolean; current: number }> {
    const key = `ddos:ip:${ip}`;
    const current = await redisClient.incr(key);
    
    if (current === 1) {
      await redisClient.expire(key, this.WINDOW_SIZE);
    }

    const allowed = current <= this.SUSPICIOUS_THRESHOLD;

    if (!allowed) {
      // Автоматическая блокировка при превышении
      await intrusionPreventionService.blockIP(ip, 'ddos_rate_limit_exceeded', 3600);
    }

    return { allowed, current };
  }

  /**
   * Проверка глобального rate limit
   */
  private async checkGlobalRateLimit(): Promise<{ allowed: boolean; current: number }> {
    const key = 'ddos:global';
    const current = await redisClient.incr(key);
    
    if (current === 1) {
      await redisClient.expire(key, this.WINDOW_SIZE);
    }

    const allowed = current <= this.GLOBAL_THRESHOLD;

    return { allowed, current };
  }

  /**
   * Обнаружение паттернов DDoS атак
   */
  private async detectDDoSPatterns(ip: string, endpoint: string): Promise<boolean> {
    // Проверка на Slowloris атаку (медленные запросы)
    const slowRequests = await this.detectSlowloris(ip);
    if (slowRequests) return true;

    // Проверка на HTTP Flood (множество запросов к одному endpoint)
    const httpFlood = await this.detectHTTPFlood(ip, endpoint);
    if (httpFlood) return true;

    // Проверка на распределенную атаку (много IP с похожим поведением)
    const distributedAttack = await this.detectDistributedAttack();
    if (distributedAttack) return true;

    return false;
  }

  /**
   * Обнаружение Slowloris атаки
   */
  private async detectSlowloris(ip: string): Promise<boolean> {
    const key = `slowloris:${ip}`;
    const connections = await redisClient.get(key);
    
    if (connections && parseInt(connections) > 50) {
      return true;
    }

    return false;
  }

  /**
   * Обнаружение HTTP Flood атаки
   */
  private async detectHTTPFlood(ip: string, endpoint: string): Promise<boolean> {
    const key = `http_flood:${ip}:${endpoint}`;
    const requests = await redisClient.incr(key);
    
    if (requests === 1) {
      await redisClient.expire(key, 10); // 10 секунд
    }

    // Более 50 запросов к одному endpoint за 10 секунд
    if (requests > 50) {
      return true;
    }

    return false;
  }

  /**
   * Обнаружение распределенной атаки
   */
  private async detectDistributedAttack(): Promise<boolean> {
    const key = 'ddos:unique_ips';
    const uniqueIPs = await redisClient.sCard(key);

    // Если более 1000 уникальных IP делают запросы одновременно
    if (uniqueIPs > 1000) {
      const globalRate = await this.checkGlobalRateLimit();
      // И общий rate высокий
      if (globalRate.current > this.GLOBAL_THRESHOLD * 0.8) {
        return true;
      }
    }

    return false;
  }

  /**
   * Регистрация IP в активных
   */
  async registerActiveIP(ip: string): Promise<void> {
    const key = 'ddos:unique_ips';
    await redisClient.sAdd(key, ip);
    await redisClient.expire(key, this.WINDOW_SIZE);
  }

  /**
   * Adaptive Rate Limiting (динамическая подстройка лимитов)
   */
  async getAdaptiveRateLimit(ip: string): Promise<RateLimitConfig> {
    const threatScore = await intrusionPreventionService.calculateThreatScore(ip);

    let config: RateLimitConfig = {
      windowMs: 60000, // 1 минута
      maxRequests: 100,
      blockDuration: 300 // 5 минут
    };

    // Снижаем лимиты для подозрительных IP
    if (threatScore.score > 50) {
      config.maxRequests = 20;
      config.blockDuration = 1800; // 30 минут
    }

    if (threatScore.score > 80) {
      config.maxRequests = 5;
      config.blockDuration = 3600; // 1 час
    }

    return config;
  }

  /**
   * Challenge-Response для подозрительных запросов
   */
  async requireChallenge(ip: string): Promise<boolean> {
    const threatScore = await intrusionPreventionService.calculateThreatScore(ip);
    return threatScore.score > 70;
  }

  /**
   * Генерация challenge токена
   */
  async generateChallenge(ip: string): Promise<string> {
    const challenge = Math.random().toString(36).substring(2, 15);
    const key = `challenge:${ip}`;
    await redisClient.setEx(key, 300, challenge); // 5 минут
    return challenge;
  }

  /**
   * Проверка challenge токена
   */
  async verifyChallenge(ip: string, response: string): Promise<boolean> {
    const key = `challenge:${ip}`;
    const challenge = await redisClient.get(key);
    
    if (challenge === response) {
      await redisClient.del(key);
      return true;
    }

    return false;
  }

  /**
   * Запись попытки DDoS атаки
   */
  private async recordDDoSAttempt(ip: string, type: string, requestCount: number): Promise<void> {
    await auditService.log({
      userId: undefined,
      action: 'ddos_attempt',
      resourceType: 'security',
      details: { ip, type, requestCount, timestamp: new Date() }
    });

    // Увеличиваем счетчик DDoS попыток
    const key = `ddos_attempts:${ip}`;
    await redisClient.incr(key);
    await redisClient.expire(key, 86400); // 24 часа
  }

  /**
   * Получение метрик DDoS
   */
  async getDDoSMetrics(): Promise<DDoSMetrics> {
    const globalKey = 'ddos:global';
    const uniqueIPsKey = 'ddos:unique_ips';

    const requestsPerSecond = parseInt(await redisClient.get(globalKey) || '0') / this.WINDOW_SIZE;
    const uniqueIPs = await redisClient.sCard(uniqueIPsKey);

    const suspiciousPatterns: string[] = [];
    let threatLevel: DDoSMetrics['threatLevel'] = 'none';

    // Анализ угрозы
    if (requestsPerSecond > this.GLOBAL_THRESHOLD * 0.5) {
      suspiciousPatterns.push('high_request_rate');
      threatLevel = 'medium';
    }

    if (requestsPerSecond > this.GLOBAL_THRESHOLD * 0.8) {
      threatLevel = 'high';
    }

    if (requestsPerSecond > this.GLOBAL_THRESHOLD) {
      suspiciousPatterns.push('global_threshold_exceeded');
      threatLevel = 'critical';
    }

    if (uniqueIPs > 500) {
      suspiciousPatterns.push('distributed_attack_suspected');
      if (threatLevel === 'none') threatLevel = 'low';
    }

    return {
      requestsPerSecond,
      uniqueIPs,
      suspiciousPatterns,
      threatLevel
    };
  }

  /**
   * Получение топ атакующих IP
   */
  async getTopAttackers(limit: number = 10): Promise<Array<{ ip: string; attempts: number }>> {
    const keys = await redisClient.keys('ddos_attempts:*');
    const attackers: Array<{ ip: string; attempts: number }> = [];

    for (const key of keys) {
      const ip = key.replace('ddos_attempts:', '');
      const attempts = parseInt(await redisClient.get(key) || '0');
      attackers.push({ ip, attempts });
    }

    return attackers
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, limit);
  }

  /**
   * Автоматическое масштабирование защиты
   */
  async autoScale(): Promise<void> {
    const metrics = await this.getDDoSMetrics();

    if (metrics.threatLevel === 'critical') {
      // Включаем максимальную защиту
      await this.enableEmergencyMode();
    } else if (metrics.threatLevel === 'high') {
      // Усиливаем rate limiting
      await this.tightenRateLimits();
    } else if (metrics.threatLevel === 'none' || metrics.threatLevel === 'low') {
      // Возвращаем нормальные лимиты
      await this.normalizeRateLimits();
    }
  }

  /**
   * Включение аварийного режима
   */
  private async enableEmergencyMode(): Promise<void> {
    await redisClient.set('ddos:emergency_mode', '1', { EX: 3600 });
    
    await auditService.log({
      userId: undefined,
      action: 'emergency_mode_enabled',
      resourceType: 'security',
      details: { reason: 'critical_ddos_threat', timestamp: new Date() }
    });
  }

  /**
   * Проверка аварийного режима
   */
  async isEmergencyMode(): Promise<boolean> {
    const mode = await redisClient.get('ddos:emergency_mode');
    return mode === '1';
  }

  /**
   * Ужесточение rate limits
   */
  private async tightenRateLimits(): Promise<void> {
    await redisClient.set('ddos:tight_limits', '1', { EX: 1800 });
  }

  /**
   * Нормализация rate limits
   */
  private async normalizeRateLimits(): Promise<void> {
    await redisClient.del('ddos:tight_limits');
    await redisClient.del('ddos:emergency_mode');
  }

  /**
   * Геоблокировка (блокировка по странам)
   */
  async blockCountry(countryCode: string, duration: number = 86400): Promise<void> {
    const key = `geo_block:${countryCode}`;
    await redisClient.setEx(key, duration, '1');

    await auditService.log({
      userId: undefined,
      action: 'country_blocked',
      resourceType: 'security',
      details: { countryCode, duration }
    });
  }

  /**
   * Проверка геоблокировки
   */
  async isCountryBlocked(countryCode: string): Promise<boolean> {
    const key = `geo_block:${countryCode}`;
    const blocked = await redisClient.get(key);
    return blocked === '1';
  }
}

export default new DDoSProtectionService();
