import { pool } from '../../config/database';
import { redisClient } from '../../config/redis';
import { auditService } from '../audit/auditService';
import intrusionPreventionService from './intrusionPreventionService';
import ddosProtectionService from './ddosProtectionService';
import anomalyDetectionService from './anomalyDetectionService';
import vulnerabilityScannerService from './vulnerabilityScannerService';

interface SecurityDashboard {
  overview: {
    threatLevel: string;
    activeIncidents: number;
    blockedIPs: number;
    activeAlerts: number;
  };
  recentIncidents: any[];
  topThreats: any[];
  metrics: {
    intrusionAttempts: number;
    ddosAttempts: number;
    anomaliesDetected: number;
    wafBlocks: number;
  };
  recommendations: string[];
}

interface SecurityAlert {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  details: any;
}

class SecurityMonitoringService {
  private readonly CHECK_INTERVAL = 60000; // 1 минута
  private monitoringInterval: NodeJS.Timeout | null = null;

  /**
   * Запуск мониторинга
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      return; // Уже запущен
    }

    console.log('🔒 Security Monitoring Service started');

    this.monitoringInterval = setInterval(async () => {
      await this.performSecurityCheck();
    }, this.CHECK_INTERVAL);

    // Первая проверка сразу
    this.performSecurityCheck();
  }

  /**
   * Остановка мониторинга
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('🔒 Security Monitoring Service stopped');
    }
  }

  /**
   * Выполнение проверки безопасности
   */
  private async performSecurityCheck(): Promise<void> {
    try {
      // Проверка DDoS метрик
      await this.checkDDoSMetrics();

      // Проверка аномалий
      await this.checkAnomalies();

      // Проверка попыток взлома
      await this.checkIntrusionAttempts();

      // Проверка заблокированных IP
      await this.checkBlockedIPs();

      // Автоматическое масштабирование защиты
      await ddosProtectionService.autoScale();

    } catch (error) {
      console.error('Security check error:', error);
    }
  }

  /**
   * Проверка DDoS метрик
   */
  private async checkDDoSMetrics(): Promise<void> {
    const metrics = await ddosProtectionService.getDDoSMetrics();

    if (metrics.threatLevel === 'critical') {
      await this.createAlert({
        type: 'ddos_attack',
        severity: 'critical',
        title: 'Critical DDoS Attack Detected',
        description: `High request rate detected: ${metrics.requestsPerSecond.toFixed(2)} req/s`,
        details: metrics
      });
    } else if (metrics.threatLevel === 'high') {
      await this.createAlert({
        type: 'ddos_warning',
        severity: 'high',
        title: 'Elevated DDoS Threat Level',
        description: `Suspicious traffic patterns detected`,
        details: metrics
      });
    }
  }

  /**
   * Проверка аномалий
   */
  private async checkAnomalies(): Promise<void> {
    const stats = await anomalyDetectionService.getAnomalyStats(1);

    const criticalAnomalies = stats.find((s: any) => s.risk === 'critical');
    if (criticalAnomalies && parseInt(criticalAnomalies.count) > 0) {
      await this.createAlert({
        type: 'critical_anomalies',
        severity: 'critical',
        title: 'Critical Anomalies Detected',
        description: `${criticalAnomalies.count} critical anomalies in last hour`,
        details: stats
      });
    }
  }

  /**
   * Проверка попыток взлома
   */
  private async checkIntrusionAttempts(): Promise<void> {
    const stats = await intrusionPreventionService.getIntrusionStats(1);

    const criticalIntrusions = stats.filter((s: any) => s.severity === 'critical');
    const totalCritical = criticalIntrusions.reduce((sum: number, s: any) => sum + parseInt(s.count), 0);

    if (totalCritical > 10) {
      await this.createAlert({
        type: 'intrusion_spike',
        severity: 'critical',
        title: 'Intrusion Attempt Spike',
        description: `${totalCritical} critical intrusion attempts in last hour`,
        details: stats
      });
    }
  }

  /**
   * Проверка заблокированных IP
   */
  private async checkBlockedIPs(): Promise<void> {
    const blockedIPs = await redisClient.keys('blocked_ip:*');

    if (blockedIPs.length > 100) {
      await this.createAlert({
        type: 'mass_blocking',
        severity: 'high',
        title: 'Mass IP Blocking Detected',
        description: `${blockedIPs.length} IPs currently blocked`,
        details: { count: blockedIPs.length }
      });
    }
  }

  /**
   * Создание алерта
   */
  async createAlert(alert: SecurityAlert): Promise<void> {
    // Проверка, не создавали ли мы уже такой алерт недавно
    const recentAlert = await pool.query(
      `SELECT id FROM security_alerts 
       WHERE alert_type = $1 AND created_at > NOW() - INTERVAL '1 hour'
       LIMIT 1`,
      [alert.type]
    );

    if (recentAlert.rows.length > 0) {
      return; // Не спамим алертами
    }

    await pool.query(
      `INSERT INTO security_alerts (alert_type, severity, title, description, details, status)
       VALUES ($1, $2, $3, $4, $5, 'new')`,
      [alert.type, alert.severity, alert.title, alert.description, JSON.stringify(alert.details)]
    );

    // Отправка уведомления (Slack, Email, PagerDuty, etc.)
    await this.sendAlertNotification(alert);

    await auditService.log({
      userId: null,
      action: 'security_alert_created',
      resourceType: 'security',
      details: alert
    });
  }

  /**
   * Отправка уведомления об алерте
   */
  private async sendAlertNotification(alert: SecurityAlert): Promise<void> {
    // TODO: Интеграция с Slack, Telegram, Email, PagerDuty
    console.log('🚨 SECURITY ALERT:', alert.title);
    console.log('   Severity:', alert.severity);
    console.log('   Description:', alert.description);
  }

  /**
   * Получение дашборда безопасности
   */
  async getSecurityDashboard(): Promise<SecurityDashboard> {
    // Обзор
    const activeIncidents = await pool.query(
      `SELECT COUNT(*) as count FROM security_incidents WHERE status IN ('open', 'investigating')`
    );

    const blockedIPs = await redisClient.keys('blocked_ip:*');

    const activeAlerts = await pool.query(
      `SELECT COUNT(*) as count FROM security_alerts WHERE status = 'new'`
    );

    const ddosMetrics = await ddosProtectionService.getDDoSMetrics();

    // Недавние инциденты
    const recentIncidents = await pool.query(
      `SELECT * FROM security_incidents 
       ORDER BY created_at DESC 
       LIMIT 10`
    );

    // Топ угрозы
    const topThreats = await intrusionPreventionService.getIntrusionStats(24);

    // Метрики
    const intrusionAttempts = await pool.query(
      `SELECT COUNT(*) as count FROM intrusion_attempts 
       WHERE created_at > NOW() - INTERVAL '24 hours'`
    );

    const ddosAttempts = await ddosProtectionService.getTopAttackers(1);

    const anomaliesDetected = await pool.query(
      `SELECT COUNT(*) as count FROM anomaly_detections 
       WHERE detected_at > NOW() - INTERVAL '24 hours'`
    );

    const wafBlocks = await pool.query(
      `SELECT COUNT(*) as count FROM waf_blocks 
       WHERE blocked_at > NOW() - INTERVAL '24 hours'`
    );

    // Рекомендации
    const recommendations = await this.generateRecommendations();

    return {
      overview: {
        threatLevel: ddosMetrics.threatLevel,
        activeIncidents: parseInt(activeIncidents.rows[0].count),
        blockedIPs: blockedIPs.length,
        activeAlerts: parseInt(activeAlerts.rows[0].count)
      },
      recentIncidents: recentIncidents.rows,
      topThreats: topThreats,
      metrics: {
        intrusionAttempts: parseInt(intrusionAttempts.rows[0].count),
        ddosAttempts: ddosAttempts.length,
        anomaliesDetected: parseInt(anomaliesDetected.rows[0].count),
        wafBlocks: parseInt(wafBlocks.rows[0].count)
      },
      recommendations
    };
  }

  /**
   * Генерация рекомендаций
   */
  private async generateRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];

    // Проверка последнего сканирования уязвимостей
    const lastScan = await vulnerabilityScannerService.getLatestScan();
    if (!lastScan || (Date.now() - lastScan.timestamp.getTime()) > 7 * 24 * 60 * 60 * 1000) {
      recommendations.push('Run vulnerability scan (last scan > 7 days ago)');
    }

    // Проверка критических уязвимостей
    if (lastScan && lastScan.summary.critical > 0) {
      recommendations.push(`Fix ${lastScan.summary.critical} critical vulnerabilities`);
    }

    // Проверка 2FA
    const no2FA = await pool.query(`
      SELECT COUNT(*) as count FROM users u
      LEFT JOIN user_2fa_settings tfa ON u.id = tfa.user_id
      WHERE (tfa.enabled IS NULL OR tfa.enabled = false) AND u.active = true
    `);

    if (parseInt(no2FA.rows[0].count) > 0) {
      recommendations.push(`Enable 2FA for ${no2FA.rows[0].count} users`);
    }

    // Проверка старых сессий
    const oldSessions = await pool.query(`
      SELECT COUNT(*) as count FROM user_sessions 
      WHERE last_activity < NOW() - INTERVAL '30 days'
    `);

    if (parseInt(oldSessions.rows[0].count) > 0) {
      recommendations.push(`Clean up ${oldSessions.rows[0].count} stale sessions`);
    }

    // Проверка заблокированных IP
    const blockedIPs = await redisClient.keys('blocked_ip:*');
    if (blockedIPs.length > 50) {
      recommendations.push(`Review ${blockedIPs.length} blocked IPs`);
    }

    return recommendations;
  }

  /**
   * Создание инцидента
   */
  async createIncident(
    type: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    description: string,
    details: any
  ): Promise<number> {
    const result = await pool.query(
      `INSERT INTO security_incidents (incident_type, severity, description, details, status)
       VALUES ($1, $2, $3, $4, 'open')
       RETURNING id`,
      [type, severity, description, JSON.stringify(details)]
    );

    const incidentId = result.rows[0].id;

    await auditService.log({
      userId: null,
      action: 'security_incident_created',
      resourceType: 'security',
      details: { incidentId, type, severity }
    });

    return incidentId;
  }

  /**
   * Обновление статуса инцидента
   */
  async updateIncidentStatus(
    incidentId: number,
    status: 'open' | 'investigating' | 'resolved' | 'false_positive',
    userId?: number
  ): Promise<void> {
    await pool.query(
      `UPDATE security_incidents 
       SET status = $1, resolved_at = $2, resolved_by = $3
       WHERE id = $4`,
      [status, status === 'resolved' ? new Date() : null, userId || null, incidentId]
    );

    await auditService.log({
      userId: userId || null,
      action: 'security_incident_updated',
      resourceType: 'security',
      details: { incidentId, status }
    });
  }

  /**
   * Получение активных алертов
   */
  async getActiveAlerts(): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM security_alerts 
       WHERE status = 'new' 
       ORDER BY severity DESC, created_at DESC`
    );

    return result.rows;
  }

  /**
   * Подтверждение алерта
   */
  async acknowledgeAlert(alertId: number, userId: number): Promise<void> {
    await pool.query(
      `UPDATE security_alerts 
       SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $1
       WHERE id = $2`,
      [userId, alertId]
    );

    await auditService.log({
      userId,
      action: 'security_alert_acknowledged',
      resourceType: 'security',
      details: { alertId }
    });
  }

  /**
   * Разрешение алерта
   */
  async resolveAlert(alertId: number, userId: number): Promise<void> {
    await pool.query(
      `UPDATE security_alerts 
       SET status = 'resolved', resolved_at = NOW(), resolved_by = $1
       WHERE id = $2`,
      [userId, alertId]
    );

    await auditService.log({
      userId,
      action: 'security_alert_resolved',
      resourceType: 'security',
      details: { alertId }
    });
  }

  /**
   * Получение статистики безопасности
   */
  async getSecurityStats(days: number = 7): Promise<any> {
    const stats = {
      intrusions: await intrusionPreventionService.getIntrusionStats(days * 24),
      anomalies: await anomalyDetectionService.getAnomalyStats(days * 24),
      incidents: await pool.query(
        `SELECT severity, COUNT(*) as count 
         FROM security_incidents 
         WHERE created_at > NOW() - INTERVAL '${days} days'
         GROUP BY severity`
      ),
      alerts: await pool.query(
        `SELECT severity, COUNT(*) as count 
         FROM security_alerts 
         WHERE created_at > NOW() - INTERVAL '${days} days'
         GROUP BY severity`
      )
    };

    return stats;
  }

  /**
   * Экспорт отчета безопасности
   */
  async exportSecurityReport(days: number = 30): Promise<any> {
    const dashboard = await this.getSecurityDashboard();
    const stats = await this.getSecurityStats(days);
    const vulnerabilityScan = await vulnerabilityScannerService.getLatestScan();

    return {
      generatedAt: new Date(),
      period: `Last ${days} days`,
      dashboard,
      stats,
      vulnerabilityScan,
      summary: {
        totalIncidents: stats.incidents.rows.reduce((sum: number, row: any) => sum + parseInt(row.count), 0),
        totalAlerts: stats.alerts.rows.reduce((sum: number, row: any) => sum + parseInt(row.count), 0),
        totalIntrusions: stats.intrusions.reduce((sum: number, row: any) => sum + parseInt(row.count), 0),
        totalAnomalies: stats.anomalies.reduce((sum: number, row: any) => sum + parseInt(row.count), 0)
      }
    };
  }
}

export default new SecurityMonitoringService();
