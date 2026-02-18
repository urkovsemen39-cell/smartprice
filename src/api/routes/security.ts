import express, { Request, Response } from 'express';
import { authenticateToken, requireAdmin, AuthRequest } from '../../middleware/auth';
import twoFactorAuthService from '../../services/security/twoFactorAuthService';
import intrusionPreventionService from '../../services/security/intrusionPreventionService';
import vulnerabilityScannerService from '../../services/security/vulnerabilityScannerService';
import ddosProtectionService from '../../services/security/ddosProtectionService';
import anomalyDetectionService from '../../services/security/anomalyDetectionService';
import securityMonitoringService from '../../services/security/securityMonitoringService';
import secretsManagementService from '../../services/security/secretsManagementService';
import wafMiddleware from '../../middleware/waf';
import logger from '../../utils/logger';

const router = express.Router();

// ============================================
// 2FA Routes
// ============================================

/**
 * Генерация 2FA секрета и QR кода
 */
router.post('/2fa/setup', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const email = req.user!.email;

    const setup = await twoFactorAuthService.generateSecret(userId, email);

    res.json({
      success: true,
      secret: setup.secret,
      qrCode: setup.qrCode,
      backupCodes: setup.backupCodes
    });
  } catch (error) {
    logger.error('2FA setup error:', error);
    res.status(500).json({ error: 'Failed to setup 2FA' });
  }
});

/**
 * Активация 2FA
 */
router.post('/2fa/enable', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const enabled = await twoFactorAuthService.enable2FA(userId, token);

    if (!enabled) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    res.json({ success: true, message: '2FA enabled successfully' });
  } catch (error) {
    logger.error('2FA enable error:', error);
    res.status(500).json({ error: 'Failed to enable 2FA' });
  }
});

/**
 * Отключение 2FA
 */
router.post('/2fa/disable', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const disabled = await twoFactorAuthService.disable2FA(userId, token);

    if (!disabled) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    res.json({ success: true, message: '2FA disabled successfully' });
  } catch (error) {
    logger.error('2FA disable error:', error);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

/**
 * Проверка 2FA токена
 */
router.post('/2fa/verify', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const verified = await twoFactorAuthService.verifyToken(userId, token);

    res.json({ success: true, verified });
  } catch (error) {
    logger.error('2FA verify error:', error);
    res.status(500).json({ error: 'Failed to verify token' });
  }
});

/**
 * Регенерация backup кодов
 */
router.post('/2fa/regenerate-backup-codes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    const backupCodes = await twoFactorAuthService.regenerateBackupCodes(userId);

    res.json({ success: true, backupCodes });
  } catch (error) {
    logger.error('Backup codes regeneration error:', error);
    res.status(500).json({ error: 'Failed to regenerate backup codes' });
  }
});

/**
 * Статус 2FA
 */
router.get('/2fa/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    const enabled = await twoFactorAuthService.is2FAEnabled(userId);

    res.json({ success: true, enabled });
  } catch (error) {
    logger.error('2FA status error:', error);
    res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

// ============================================
// Security Monitoring Routes (Admin only)
// ============================================

/**
 * Получение дашборда безопасности (только для админов)
 */
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const dashboard = await securityMonitoringService.getSecurityDashboard();

    res.json({ success: true, dashboard });
  } catch (error) {
    logger.error('Security dashboard error:', error);
    res.status(500).json({ error: 'Failed to get security dashboard' });
  }
});

/**
 * Получение активных алертов (только для админов)
 */
router.get('/alerts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const alerts = await securityMonitoringService.getActiveAlerts();

    res.json({ success: true, alerts });
  } catch (error) {
    logger.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

/**
 * Подтверждение алерта
 */
router.post('/alerts/:id/acknowledge', authenticateToken, async (req, res) => {
  try {
    const alertId = parseInt(req.params.id);
    const userId = req.user!.id;

    await securityMonitoringService.acknowledgeAlert(alertId, userId);

    res.json({ success: true, message: 'Alert acknowledged' });
  } catch (error) {
    logger.error('Acknowledge alert error:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

/**
 * Разрешение алерта
 */
router.post('/alerts/:id/resolve', authenticateToken, async (req, res) => {
  try {
    const alertId = parseInt(req.params.id);
    const userId = req.user!.id;

    await securityMonitoringService.resolveAlert(alertId, userId);

    res.json({ success: true, message: 'Alert resolved' });
  } catch (error) {
    logger.error('Resolve alert error:', error);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

/**
 * Запуск сканирования уязвимостей
 */
router.post('/scan/vulnerabilities', authenticateToken, async (req, res) => {
  try {
    const result = await vulnerabilityScannerService.performFullScan();

    res.json({ success: true, result });
  } catch (error) {
    logger.error('Vulnerability scan error:', error);
    res.status(500).json({ error: 'Failed to perform vulnerability scan' });
  }
});

/**
 * Получение последнего сканирования
 */
router.get('/scan/latest', authenticateToken, async (req, res) => {
  try {
    const scan = await vulnerabilityScannerService.getLatestScan();

    res.json({ success: true, scan });
  } catch (error) {
    logger.error('Get latest scan error:', error);
    res.status(500).json({ error: 'Failed to get latest scan' });
  }
});

/**
 * История сканирований
 */
router.get('/scan/history', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const history = await vulnerabilityScannerService.getScanHistory(limit);

    res.json({ success: true, history });
  } catch (error) {
    logger.error('Get scan history error:', error);
    res.status(500).json({ error: 'Failed to get scan history' });
  }
});

/**
 * Статистика попыток взлома
 */
router.get('/intrusions/stats', authenticateToken, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const stats = await intrusionPreventionService.getIntrusionStats(hours);

    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Get intrusion stats error:', error);
    res.status(500).json({ error: 'Failed to get intrusion stats' });
  }
});

/**
 * DDoS метрики
 */
router.get('/ddos/metrics', authenticateToken, async (req, res) => {
  try {
    const metrics = await ddosProtectionService.getDDoSMetrics();

    res.json({ success: true, metrics });
  } catch (error) {
    logger.error('Get DDoS metrics error:', error);
    res.status(500).json({ error: 'Failed to get DDoS metrics' });
  }
});

/**
 * Топ атакующих IP
 */
router.get('/ddos/top-attackers', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const attackers = await ddosProtectionService.getTopAttackers(limit);

    res.json({ success: true, attackers });
  } catch (error) {
    logger.error('Get top attackers error:', error);
    res.status(500).json({ error: 'Failed to get top attackers' });
  }
});

/**
 * Блокировка IP (только для админов)
 */
router.post('/ip/block', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { ip, reason, duration } = req.body;

    if (!ip) {
      return res.status(400).json({ error: 'IP address is required' });
    }

    // Валидация IP адреса
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/;
    
    if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
      return res.status(400).json({ error: 'Invalid IP address format' });
    }

    // Дополнительная проверка для IPv4
    if (ipv4Regex.test(ip)) {
      const parts = ip.split('.').map((part: string) => Number(part));
      if (parts.some((part: number) => part < 0 || part > 255)) {
        return res.status(400).json({ error: 'Invalid IPv4 address' });
      }
    }

    await intrusionPreventionService.blockIP(ip, reason || 'manual_block', duration);

    res.json({ success: true, message: 'IP blocked successfully' });
  } catch (error) {
    logger.error('Block IP error:', error);
    res.status(500).json({ error: 'Failed to block IP' });
  }
});

/**
 * Разблокировка IP (только для админов)
 */
router.post('/ip/unblock', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { ip } = req.body;

    if (!ip) {
      return res.status(400).json({ error: 'IP address is required' });
    }

    // Валидация IP адреса
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/;
    
    if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
      return res.status(400).json({ error: 'Invalid IP address format' });
    }

    await intrusionPreventionService.unblockIP(ip);

    res.json({ success: true, message: 'IP unblocked successfully' });
  } catch (error) {
    logger.error('Unblock IP error:', error);
    res.status(500).json({ error: 'Failed to unblock IP' });
  }
});

/**
 * Добавление IP в черный список
 */
router.post('/ip/blacklist', authenticateToken, async (req, res) => {
  try {
    const { ip, reason } = req.body;

    if (!ip) {
      return res.status(400).json({ error: 'IP address is required' });
    }

    await intrusionPreventionService.addToBlacklist(ip, reason || 'manual_blacklist');

    res.json({ success: true, message: 'IP added to blacklist' });
  } catch (error) {
    logger.error('Blacklist IP error:', error);
    res.status(500).json({ error: 'Failed to blacklist IP' });
  }
});

/**
 * Статистика аномалий
 */
router.get('/anomalies/stats', authenticateToken, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const stats = await anomalyDetectionService.getAnomalyStats(hours);

    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Get anomaly stats error:', error);
    res.status(500).json({ error: 'Failed to get anomaly stats' });
  }
});

/**
 * WAF статистика
 */
router.get('/waf/stats', authenticateToken, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const stats = await wafMiddleware.getWAFStats(hours);

    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Get WAF stats error:', error);
    res.status(500).json({ error: 'Failed to get WAF stats' });
  }
});

/**
 * Топ заблокированных IP (WAF)
 */
router.get('/waf/top-blocked', authenticateToken, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const limit = parseInt(req.query.limit as string) || 10;
    const blocked = await wafMiddleware.getTopBlockedIPs(hours, limit);

    res.json({ success: true, blocked });
  } catch (error) {
    logger.error('Get top blocked IPs error:', error);
    res.status(500).json({ error: 'Failed to get top blocked IPs' });
  }
});

/**
 * Экспорт отчета безопасности
 */
router.get('/report', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const report = await securityMonitoringService.exportSecurityReport(days);

    res.json({ success: true, report });
  } catch (error) {
    logger.error('Export report error:', error);
    res.status(500).json({ error: 'Failed to export security report' });
  }
});

/**
 * Ротация секретов
 */
router.post('/secrets/rotate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { secretType } = req.body;

    let result;

    if (secretType === 'jwt_secret') {
      result = await secretsManagementService.rotateJWTSecret(userId);
    } else if (secretType === 'session_secret') {
      result = await secretsManagementService.rotateSessionSecret(userId);
    } else if (secretType === 'all') {
      const results = await secretsManagementService.rotateAllSecrets(userId);
      return res.json({ success: true, results });
    } else {
      return res.status(400).json({ error: 'Invalid secret type' });
    }

    res.json({ success: true, result });
  } catch (error) {
    logger.error('Rotate secrets error:', error);
    res.status(500).json({ error: 'Failed to rotate secrets' });
  }
});

/**
 * История ротаций секретов
 */
router.get('/secrets/history', authenticateToken, async (req, res) => {
  try {
    const secretType = req.query.secretType as string;
    const limit = parseInt(req.query.limit as string) || 10;

    const history = await secretsManagementService.getRotationHistory(secretType, limit);

    res.json({ success: true, history });
  } catch (error) {
    logger.error('Get rotation history error:', error);
    res.status(500).json({ error: 'Failed to get rotation history' });
  }
});

export default router;

