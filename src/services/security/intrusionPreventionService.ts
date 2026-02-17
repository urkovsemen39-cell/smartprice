import { pool } from '../../config/database';
import { redisClient } from '../../config/redis';
import { auditService } from '../audit/auditService';

interface IntrusionAttempt {
  ip: string;
  userId?: number;
  attackType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: any;
}

interface ThreatScore {
  score: number;
  reasons: string[];
  blocked: boolean;
}

class IntrusionPreventionService {
  private readonly BLOCK_DURATION = 3600; // 1 час
  private readonly THREAT_THRESHOLD = 100;

  /**
   * Обнаружение и блокировка SQL Injection атак
   */
  detectSQLInjection(input: string, ip: string): boolean {
    const sqlPatterns = [
      /(\bUNION\b.*\bSELECT\b)/i,
      /(\bSELECT\b.*\bFROM\b.*\bWHERE\b)/i,
      /(\bINSERT\b.*\bINTO\b.*\bVALUES\b)/i,
      /(\bDELETE\b.*\bFROM\b)/i,
      /(\bDROP\b.*\bTABLE\b)/i,
      /(\bUPDATE\b.*\bSET\b)/i,
      /(--|\#|\/\*|\*\/)/,
      /(\bOR\b.*=.*)/i,
      /(\bAND\b.*=.*)/i,
      /(;.*\bEXEC\b)/i,
      /(\bxp_cmdshell\b)/i,
      /(\bSLEEP\b\()/i,
      /(\bBENCHMARK\b\()/i
    ];

    for (const pattern of sqlPatterns) {
      if (pattern.test(input)) {
        this.recordIntrusion({
          ip,
          attackType: 'sql_injection',
          severity: 'critical',
          details: { input, pattern: pattern.toString() }
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Обнаружение XSS атак
   */
  detectXSS(input: string, ip: string): boolean {
    const xssPatterns = [
      /<script[^>]*>.*<\/script>/i,
      /javascript:/i,
      /on\w+\s*=/i, // onclick, onload, etc.
      /<iframe[^>]*>/i,
      /<object[^>]*>/i,
      /<embed[^>]*>/i,
      /eval\(/i,
      /expression\(/i,
      /<img[^>]*onerror/i
    ];

    for (const pattern of xssPatterns) {
      if (pattern.test(input)) {
        this.recordIntrusion({
          ip,
          attackType: 'xss',
          severity: 'high',
          details: { input, pattern: pattern.toString() }
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Обнаружение Path Traversal атак
   */
  detectPathTraversal(input: string, ip: string): boolean {
    const pathPatterns = [
      /\.\.[\/\\]/,
      /%2e%2e[\/\\]/i,
      /\.\.[%2f%5c]/i,
      /\/etc\/passwd/i,
      /\/windows\/system32/i,
      /\.\.%c0%af/i
    ];

    for (const pattern of pathPatterns) {
      if (pattern.test(input)) {
        this.recordIntrusion({
          ip,
          attackType: 'path_traversal',
          severity: 'high',
          details: { input, pattern: pattern.toString() }
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Обнаружение Command Injection атак
   */
  detectCommandInjection(input: string, ip: string): boolean {
    const cmdPatterns = [
      /[;&|`$()]/,
      /\$\{.*\}/,
      /\$\(.*\)/,
      /`.*`/,
      /\|\|/,
      /&&/
    ];

    for (const pattern of cmdPatterns) {
      if (pattern.test(input)) {
        this.recordIntrusion({
          ip,
          attackType: 'command_injection',
          severity: 'critical',
          details: { input, pattern: pattern.toString() }
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Обнаружение LDAP Injection атак
   */
  detectLDAPInjection(input: string, ip: string): boolean {
    const ldapPatterns = [
      /\*\)/,
      /\(\|/,
      /\(&/,
      /\(!/,
      /\)\(/
    ];

    for (const pattern of ldapPatterns) {
      if (pattern.test(input)) {
        this.recordIntrusion({
          ip,
          attackType: 'ldap_injection',
          severity: 'high',
          details: { input, pattern: pattern.toString() }
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Обнаружение Credential Stuffing атак
   */
  async detectCredentialStuffing(ip: string, email: string): Promise<boolean> {
    const key = `credential_stuffing:${ip}`;
    const attempts = await redisClient.incr(key);
    await redisClient.expire(key, 300); // 5 минут

    // Более 10 попыток входа с разными email за 5 минут
    if (attempts > 10) {
      this.recordIntrusion({
        ip,
        attackType: 'credential_stuffing',
        severity: 'critical',
        details: { attempts, email }
      });
      return true;
    }

    return false;
  }

  /**
   * Обнаружение Account Takeover попыток
   */
  async detectAccountTakeover(userId: number, ip: string, userAgent: string): Promise<boolean> {
    // Получаем последние сессии пользователя
    const result = await pool.query(
      `SELECT ip_address, user_agent, created_at 
       FROM user_sessions 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [userId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const lastSession = result.rows[0];
    const suspiciousFactors: string[] = [];

    // Проверка смены IP
    if (lastSession.ip_address !== ip) {
      suspiciousFactors.push('ip_change');
    }

    // Проверка смены User Agent
    if (lastSession.user_agent !== userAgent) {
      suspiciousFactors.push('user_agent_change');
    }

    // Проверка времени между входами (менее 1 минуты подозрительно)
    const timeDiff = Date.now() - new Date(lastSession.created_at).getTime();
    if (timeDiff < 60000) {
      suspiciousFactors.push('rapid_login');
    }

    if (suspiciousFactors.length >= 2) {
      this.recordIntrusion({
        ip,
        userId,
        attackType: 'account_takeover',
        severity: 'high',
        details: { suspiciousFactors, userAgent }
      });
      return true;
    }

    return false;
  }

  /**
   * Расчет threat score для IP
   */
  async calculateThreatScore(ip: string): Promise<ThreatScore> {
    let score = 0;
    const reasons: string[] = [];

    // Проверка в черном списке
    const isBlacklisted = await this.isIPBlacklisted(ip);
    if (isBlacklisted) {
      score += 100;
      reasons.push('blacklisted');
    }

    // Количество попыток взлома за последний час
    const intrusionCount = await this.getIntrusionCount(ip, 3600);
    if (intrusionCount > 0) {
      score += intrusionCount * 20;
      reasons.push(`${intrusionCount} intrusion attempts`);
    }

    // Количество неудачных входов
    const failedLogins = await this.getFailedLoginCount(ip, 3600);
    if (failedLogins > 5) {
      score += failedLogins * 5;
      reasons.push(`${failedLogins} failed logins`);
    }

    // Проверка rate limit нарушений
    const rateLimitViolations = await this.getRateLimitViolations(ip, 3600);
    if (rateLimitViolations > 10) {
      score += rateLimitViolations * 2;
      reasons.push(`${rateLimitViolations} rate limit violations`);
    }

    const blocked = score >= this.THREAT_THRESHOLD;

    if (blocked) {
      await this.blockIP(ip, 'high_threat_score', score);
    }

    return { score, reasons, blocked };
  }

  /**
   * Блокировка IP адреса
   */
  async blockIP(ip: string, reason: string, duration: number = this.BLOCK_DURATION): Promise<void> {
    const key = `blocked_ip:${ip}`;
    await redisClient.setEx(key, duration, JSON.stringify({ reason, blockedAt: Date.now() }));

    await auditService.log({
      userId: null,
      action: 'ip_blocked',
      resourceType: 'security',
      details: { ip, reason, duration }
    });
  }

  /**
   * Проверка, заблокирован ли IP
   */
  async isIPBlocked(ip: string): Promise<boolean> {
    const key = `blocked_ip:${ip}`;
    const blocked = await redisClient.get(key);
    return blocked !== null;
  }

  /**
   * Разблокировка IP
   */
  async unblockIP(ip: string): Promise<void> {
    const key = `blocked_ip:${ip}`;
    await redisClient.del(key);

    await auditService.log({
      userId: null,
      action: 'ip_unblocked',
      resourceType: 'security',
      details: { ip }
    });
  }

  /**
   * Добавление IP в черный список
   */
  async addToBlacklist(ip: string, reason: string): Promise<void> {
    await pool.query(
      `INSERT INTO ip_blacklist (ip_address, reason, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (ip_address) DO UPDATE SET reason = $2, updated_at = NOW()`,
      [ip, reason]
    );
  }

  /**
   * Проверка IP в черном списке
   */
  async isIPBlacklisted(ip: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT 1 FROM ip_blacklist WHERE ip_address = $1',
      [ip]
    );
    return result.rows.length > 0;
  }

  /**
   * Запись попытки взлома
   */
  private async recordIntrusion(attempt: IntrusionAttempt): Promise<void> {
    await pool.query(
      `INSERT INTO intrusion_attempts (ip_address, user_id, attack_type, severity, details, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [attempt.ip, attempt.userId || null, attempt.attackType, attempt.severity, JSON.stringify(attempt.details)]
    );

    // Автоматическая блокировка при критичных атаках
    if (attempt.severity === 'critical') {
      await this.blockIP(attempt.ip, attempt.attackType, this.BLOCK_DURATION * 2);
    }

    await auditService.log({
      userId: attempt.userId || null,
      action: 'intrusion_detected',
      resourceType: 'security',
      details: attempt
    });
  }

  /**
   * Получение количества попыток взлома
   */
  private async getIntrusionCount(ip: string, seconds: number): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*) as count 
       FROM intrusion_attempts 
       WHERE ip_address = $1 AND created_at > NOW() - INTERVAL '${seconds} seconds'`,
      [ip]
    );
    return parseInt(result.rows[0].count);
  }

  /**
   * Получение количества неудачных входов
   */
  private async getFailedLoginCount(ip: string, seconds: number): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*) as count 
       FROM login_attempts 
       WHERE ip_address = $1 AND success = false AND created_at > NOW() - INTERVAL '${seconds} seconds'`,
      [ip]
    );
    return parseInt(result.rows[0].count);
  }

  /**
   * Получение количества нарушений rate limit
   */
  private async getRateLimitViolations(ip: string, seconds: number): Promise<number> {
    const key = `rate_limit_violations:${ip}`;
    const violations = await redisClient.get(key);
    return violations ? parseInt(violations) : 0;
  }

  /**
   * Получение статистики по атакам
   */
  async getIntrusionStats(hours: number = 24): Promise<any> {
    const result = await pool.query(
      `SELECT 
        attack_type,
        severity,
        COUNT(*) as count,
        COUNT(DISTINCT ip_address) as unique_ips
       FROM intrusion_attempts
       WHERE created_at > NOW() - INTERVAL '${hours} hours'
       GROUP BY attack_type, severity
       ORDER BY count DESC`,
      []
    );

    return result.rows;
  }
}

export default new IntrusionPreventionService();
