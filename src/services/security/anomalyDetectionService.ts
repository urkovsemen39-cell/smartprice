import { pool } from '../../config/database';
import { redisClient } from '../../config/redis';
import { auditService } from '../audit/auditService';

interface UserBehaviorProfile {
  userId: number;
  avgRequestsPerHour: number;
  commonIPs: string[];
  commonUserAgents: string[];
  commonEndpoints: string[];
  typicalLoginTimes: number[]; // часы дня
  typicalLocations: string[];
}

interface AnomalyScore {
  score: number; // 0-100
  anomalies: string[];
  risk: 'low' | 'medium' | 'high' | 'critical';
  shouldBlock: boolean;
}

class AnomalyDetectionService {
  private readonly ANOMALY_THRESHOLD = 70;
  private readonly LEARNING_PERIOD_DAYS = 7;

  /**
   * Построение профиля поведения пользователя
   */
  async buildUserProfile(userId: number): Promise<UserBehaviorProfile> {
    // Анализ последних 7 дней активности
    const sessions = await pool.query(
      `SELECT ip_address, user_agent, created_at, last_activity
       FROM user_sessions
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${this.LEARNING_PERIOD_DAYS} days'`,
      [userId]
    );

    const loginAttempts = await pool.query(
      `SELECT ip_address, created_at
       FROM login_attempts
       WHERE user_id = $1 AND success = true AND created_at > NOW() - INTERVAL '${this.LEARNING_PERIOD_DAYS} days'`,
      [userId]
    );

    // Подсчет средних запросов в час
    const avgRequestsPerHour = sessions.rows.length / (this.LEARNING_PERIOD_DAYS * 24);

    // Определение общих IP адресов
    const ipCounts = new Map<string, number>();
    sessions.rows.forEach(row => {
      ipCounts.set(row.ip_address, (ipCounts.get(row.ip_address) || 0) + 1);
    });
    const commonIPs = Array.from(ipCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ip]) => ip);

    // Определение общих User Agents
    const uaCounts = new Map<string, number>();
    sessions.rows.forEach(row => {
      uaCounts.set(row.user_agent, (uaCounts.get(row.user_agent) || 0) + 1);
    });
    const commonUserAgents = Array.from(uaCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ua]) => ua);

    // Определение типичных времен входа
    const loginHours = loginAttempts.rows.map(row => new Date(row.created_at).getHours());
    const typicalLoginTimes = [...new Set(loginHours)] as number[];

    const profile: UserBehaviorProfile = {
      userId,
      avgRequestsPerHour,
      commonIPs,
      commonUserAgents,
      commonEndpoints: [], // Можно расширить
      typicalLoginTimes,
      typicalLocations: [] // Требует GeoIP
    };

    // Сохранение профиля
    await this.saveUserProfile(profile);

    return profile;
  }

  /**
   * Обнаружение аномалий в поведении
   */
  async detectAnomalies(
    userId: number,
    ip: string,
    userAgent: string,
    endpoint: string
  ): Promise<AnomalyScore> {
    const profile = await this.getUserProfile(userId);
    
    if (!profile) {
      // Профиль еще не построен, строим его
      await this.buildUserProfile(userId);
      return { score: 0, anomalies: [], risk: 'low', shouldBlock: false };
    }

    let score = 0;
    const anomalies: string[] = [];

    // 1. Проверка IP адреса
    if (!profile.commonIPs.includes(ip)) {
      score += 20;
      anomalies.push('unknown_ip');
    }

    // 2. Проверка User Agent
    if (!profile.commonUserAgents.some(ua => userAgent.includes(ua.substring(0, 20)))) {
      score += 15;
      anomalies.push('unknown_user_agent');
    }

    // 3. Проверка времени входа
    const currentHour = new Date().getHours();
    if (!profile.typicalLoginTimes.includes(currentHour)) {
      score += 10;
      anomalies.push('unusual_time');
    }

    // 4. Проверка частоты запросов
    const recentRequests = await this.getRecentRequestCount(userId, 3600); // последний час
    if (recentRequests > profile.avgRequestsPerHour * 3) {
      score += 25;
      anomalies.push('excessive_requests');
    }

    // 5. Проверка на множественные неудачные попытки
    const failedAttempts = await this.getRecentFailedAttempts(userId, 1800); // 30 минут
    if (failedAttempts > 3) {
      score += 30;
      anomalies.push('multiple_failed_attempts');
    }

    // 6. Проверка на быструю смену IP
    const ipChanges = await this.getRecentIPChanges(userId, 3600);
    if (ipChanges > 3) {
      score += 20;
      anomalies.push('rapid_ip_changes');
    }

    // 7. Проверка на подозрительные endpoint'ы
    if (this.isSensitiveEndpoint(endpoint)) {
      const sensitiveAccess = await this.getRecentSensitiveAccess(userId, 3600);
      if (sensitiveAccess > 5) {
        score += 15;
        anomalies.push('excessive_sensitive_access');
      }
    }

    // Определение уровня риска
    let risk: AnomalyScore['risk'] = 'low';
    if (score >= 70) risk = 'critical';
    else if (score >= 50) risk = 'high';
    else if (score >= 30) risk = 'medium';

    const shouldBlock = score >= this.ANOMALY_THRESHOLD;

    // Логирование аномалии
    if (anomalies.length > 0) {
      await this.logAnomaly(userId, ip, score, anomalies, risk);
    }

    // Автоматическая блокировка при критическом уровне
    if (shouldBlock) {
      await this.handleCriticalAnomaly(userId, ip, anomalies);
    }

    return { score, anomalies, risk, shouldBlock };
  }

  /**
   * Обнаружение credential stuffing
   */
  async detectCredentialStuffing(ip: string): Promise<boolean> {
    const key = `credential_stuffing:${ip}`;
    
    // Подсчет уникальных email за последние 5 минут
    const emails = await redisClient.sMembers(`${key}:emails`);
    
    // Более 10 разных email с одного IP за 5 минут
    if (emails.length > 10) {
      await auditService.log({
        userId: null,
        action: 'credential_stuffing_detected',
        resourceType: 'security',
        details: { ip, uniqueEmails: emails.length }
      });
      return true;
    }

    return false;
  }

  /**
   * Регистрация попытки входа для анализа credential stuffing
   */
  async registerLoginAttempt(ip: string, email: string): Promise<void> {
    const key = `credential_stuffing:${ip}`;
    await redisClient.sAdd(`${key}:emails`, email);
    await redisClient.expire(`${key}:emails`, 300); // 5 минут
  }

  /**
   * Обнаружение account takeover
   */
  async detectAccountTakeover(userId: number, ip: string, userAgent: string): Promise<boolean> {
    const recentSessions = await pool.query(
      `SELECT ip_address, user_agent, created_at
       FROM user_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    if (recentSessions.rows.length === 0) {
      return false;
    }

    const lastSession = recentSessions.rows[0];
    let suspicionScore = 0;

    // Смена IP
    if (lastSession.ip_address !== ip) {
      suspicionScore += 30;
    }

    // Смена User Agent
    if (lastSession.user_agent !== userAgent) {
      suspicionScore += 20;
    }

    // Быстрая смена (менее 1 минуты)
    const timeDiff = Date.now() - new Date(lastSession.created_at).getTime();
    if (timeDiff < 60000) {
      suspicionScore += 50;
    }

    if (suspicionScore >= 70) {
      await auditService.log({
        userId,
        action: 'account_takeover_suspected',
        resourceType: 'security',
        details: { ip, userAgent, suspicionScore }
      });
      return true;
    }

    return false;
  }

  /**
   * Обнаружение bot активности
   */
  async detectBotActivity(ip: string, userAgent: string): Promise<boolean> {
    // Проверка на известных ботов
    const botPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python-requests/i,
      /java/i
    ];

    for (const pattern of botPatterns) {
      if (pattern.test(userAgent)) {
        return true;
      }
    }

    // Проверка на слишком быстрые запросы (менее 100ms между запросами)
    const key = `bot_detection:${ip}`;
    const lastRequest = await redisClient.get(key);
    
    if (lastRequest) {
      const timeDiff = Date.now() - parseInt(lastRequest);
      if (timeDiff < 100) {
        await auditService.log({
          userId: null,
          action: 'bot_activity_detected',
          resourceType: 'security',
          details: { ip, userAgent, timeDiff }
        });
        return true;
      }
    }

    await redisClient.set(key, Date.now().toString(), { EX: 1 });
    return false;
  }

  /**
   * Сохранение профиля пользователя
   */
  private async saveUserProfile(profile: UserBehaviorProfile): Promise<void> {
    await pool.query(
      `INSERT INTO user_behavior_profiles (user_id, profile_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET profile_data = $2, updated_at = NOW()`,
      [profile.userId, JSON.stringify(profile)]
    );
  }

  /**
   * Получение профиля пользователя
   */
  private async getUserProfile(userId: number): Promise<UserBehaviorProfile | null> {
    const result = await pool.query(
      'SELECT profile_data FROM user_behavior_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return JSON.parse(result.rows[0].profile_data);
  }

  /**
   * Получение количества недавних запросов
   */
  private async getRecentRequestCount(userId: number, seconds: number): Promise<number> {
    const key = `user_requests:${userId}`;
    const count = await redisClient.get(key);
    return count ? parseInt(count) : 0;
  }

  /**
   * Получение недавних неудачных попыток
   */
  private async getRecentFailedAttempts(userId: number, seconds: number): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM login_attempts
       WHERE user_id = $1 AND success = false AND created_at > NOW() - INTERVAL '${seconds} seconds'`,
      [userId]
    );
    return parseInt(result.rows[0].count);
  }

  /**
   * Получение количества смен IP
   */
  private async getRecentIPChanges(userId: number, seconds: number): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(DISTINCT ip_address) as count
       FROM user_sessions
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${seconds} seconds'`,
      [userId]
    );
    return parseInt(result.rows[0].count);
  }

  /**
   * Проверка на чувствительный endpoint
   */
  private isSensitiveEndpoint(endpoint: string): boolean {
    const sensitivePatterns = [
      '/admin',
      '/api/users',
      '/api/api-keys',
      '/api/sessions',
      '/api/audit'
    ];

    return sensitivePatterns.some(pattern => endpoint.includes(pattern));
  }

  /**
   * Получение количества обращений к чувствительным endpoint'ам
   */
  private async getRecentSensitiveAccess(userId: number, seconds: number): Promise<number> {
    const key = `sensitive_access:${userId}`;
    const count = await redisClient.get(key);
    return count ? parseInt(count) : 0;
  }

  /**
   * Логирование аномалии
   */
  private async logAnomaly(
    userId: number,
    ip: string,
    score: number,
    anomalies: string[],
    risk: string
  ): Promise<void> {
    await pool.query(
      `INSERT INTO anomaly_detections (user_id, ip_address, score, anomalies, risk, detected_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [userId, ip, score, JSON.stringify(anomalies), risk]
    );

    await auditService.log({
      userId,
      action: 'anomaly_detected',
      resourceType: 'security',
      details: { ip, score, anomalies, risk }
    });
  }

  /**
   * Обработка критической аномалии
   */
  private async handleCriticalAnomaly(userId: number, ip: string, anomalies: string[]): Promise<void> {
    // Временная блокировка аккаунта
    await pool.query(
      'UPDATE users SET account_locked = true, locked_at = NOW(), lock_reason = $1 WHERE id = $2',
      [JSON.stringify(anomalies), userId]
    );

    // Завершение всех сессий
    await pool.query(
      'DELETE FROM user_sessions WHERE user_id = $1',
      [userId]
    );

    // Отправка уведомления пользователю (через email queue)
    // TODO: Интеграция с email service

    await auditService.log({
      userId,
      action: 'account_locked_anomaly',
      resourceType: 'security',
      details: { ip, anomalies, reason: 'critical_anomaly_detected' }
    });
  }

  /**
   * Получение статистики аномалий
   */
  async getAnomalyStats(hours: number = 24): Promise<any> {
    const result = await pool.query(
      `SELECT 
        risk,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT ip_address) as unique_ips
       FROM anomaly_detections
       WHERE detected_at > NOW() - INTERVAL '${hours} hours'
       GROUP BY risk
       ORDER BY 
         CASE risk
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
         END`,
      []
    );

    return result.rows;
  }

  /**
   * Автоматическое обновление профилей (запускать периодически)
   */
  async updateAllProfiles(): Promise<void> {
    const users = await pool.query('SELECT id FROM users WHERE active = true');
    
    for (const user of users.rows) {
      try {
        await this.buildUserProfile(user.id);
      } catch (error) {
        console.error(`Failed to update profile for user ${user.id}:`, error);
      }
    }
  }
}

export default new AnomalyDetectionService();
