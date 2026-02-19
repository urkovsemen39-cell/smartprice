import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import intrusionPreventionService from '../services/security/intrusionPreventionService';

interface WAFRule {
  id: string;
  name: string;
  description: string;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: 'log' | 'block';
}

class WAFMiddleware {
  private rules: WAFRule[] = [];

  constructor() {
    this.initializeRules();
  }

  /**
   * Инициализация правил WAF
   */
  private initializeRules(): void {
    this.rules = [
      // SQL Injection Rules
      {
        id: 'SQL-001',
        name: 'SQL Injection - UNION SELECT',
        description: 'Detects UNION SELECT SQL injection attempts',
        pattern: /(\bUNION\b.*\bSELECT\b)/i,
        severity: 'critical',
        action: 'block'
      },
      {
        id: 'SQL-002',
        name: 'SQL Injection - OR 1=1',
        description: 'Detects OR 1=1 SQL injection attempts',
        pattern: /(\bOR\b\s+[\d\w]+\s*=\s*[\d\w]+)/i,
        severity: 'critical',
        action: 'block'
      },
      {
        id: 'SQL-003',
        name: 'SQL Injection - DROP TABLE',
        description: 'Detects DROP TABLE attempts',
        pattern: /(\bDROP\b.*\bTABLE\b)/i,
        severity: 'critical',
        action: 'block'
      },
      {
        id: 'SQL-004',
        name: 'SQL Injection - Comments',
        description: 'Detects SQL comment injection',
        pattern: /(--|#|\/\*|\*\/)/,
        severity: 'high',
        action: 'block'
      },
      {
        id: 'SQL-005',
        name: 'SQL Injection - EXEC',
        description: 'Detects EXEC command injection',
        pattern: /(;.*\bEXEC\b|\bxp_cmdshell\b)/i,
        severity: 'critical',
        action: 'block'
      },
      {
        id: 'SQL-006',
        name: 'SQL Injection - Time-based',
        description: 'Detects time-based SQL injection',
        pattern: /(\bSLEEP\b\(|\bBENCHMARK\b\(|\bWAITFOR\b)/i,
        severity: 'high',
        action: 'block'
      },

      // XSS Rules
      {
        id: 'XSS-001',
        name: 'XSS - Script Tag',
        description: 'Detects script tag injection',
        pattern: /<script[^>]*>.*<\/script>/i,
        severity: 'high',
        action: 'block'
      },
      {
        id: 'XSS-002',
        name: 'XSS - Event Handlers',
        description: 'Detects event handler injection',
        pattern: /on\w+\s*=/i,
        severity: 'high',
        action: 'block'
      },
      {
        id: 'XSS-003',
        name: 'XSS - JavaScript Protocol',
        description: 'Detects javascript: protocol',
        pattern: /javascript:/i,
        severity: 'high',
        action: 'block'
      },
      {
        id: 'XSS-004',
        name: 'XSS - Iframe Injection',
        description: 'Detects iframe injection',
        pattern: /<iframe[^>]*>/i,
        severity: 'high',
        action: 'block'
      },
      {
        id: 'XSS-005',
        name: 'XSS - Object/Embed',
        description: 'Detects object/embed injection',
        pattern: /(<object[^>]*>|<embed[^>]*>)/i,
        severity: 'medium',
        action: 'block'
      },

      // Path Traversal Rules
      {
        id: 'PATH-001',
        name: 'Path Traversal - Dot Dot Slash',
        description: 'Detects directory traversal attempts',
        pattern: /\.\.[\/\\]/,
        severity: 'high',
        action: 'block'
      },
      {
        id: 'PATH-002',
        name: 'Path Traversal - Encoded',
        description: 'Detects encoded directory traversal',
        pattern: /(%2e%2e[\/\\]|%252e%252e)/i,
        severity: 'high',
        action: 'block'
      },
      {
        id: 'PATH-003',
        name: 'Path Traversal - System Files',
        description: 'Detects access to system files',
        pattern: /(\/etc\/passwd|\/windows\/system32|\.\.%c0%af)/i,
        severity: 'critical',
        action: 'block'
      },

      // Command Injection Rules
      {
        id: 'CMD-001',
        name: 'Command Injection - Shell Metacharacters',
        description: 'Detects shell command injection',
        pattern: /[;&|`$]/,
        severity: 'critical',
        action: 'block'
      },
      {
        id: 'CMD-002',
        name: 'Command Injection - Command Substitution',
        description: 'Detects command substitution',
        pattern: /(\$\{.*\}|\$\(.*\)|`.*`)/,
        severity: 'critical',
        action: 'block'
      },

      // LDAP Injection Rules
      {
        id: 'LDAP-001',
        name: 'LDAP Injection',
        description: 'Detects LDAP injection attempts',
        pattern: /(\*\)|\(\||\(&|\(!|\)\()/,
        severity: 'high',
        action: 'block'
      },

      // XXE (XML External Entity) Rules
      {
        id: 'XXE-001',
        name: 'XXE - DOCTYPE',
        description: 'Detects XXE attacks',
        pattern: /<!DOCTYPE[^>]*\[.*<!ENTITY/i,
        severity: 'high',
        action: 'block'
      },
      {
        id: 'XXE-002',
        name: 'XXE - SYSTEM',
        description: 'Detects XXE SYSTEM entity',
        pattern: /<!ENTITY[^>]*SYSTEM/i,
        severity: 'high',
        action: 'block'
      },

      // SSRF (Server-Side Request Forgery) Rules
      {
        id: 'SSRF-001',
        name: 'SSRF - Localhost',
        description: 'Detects SSRF to localhost',
        pattern: /(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)/i,
        severity: 'high',
        action: 'log'
      },
      {
        id: 'SSRF-002',
        name: 'SSRF - Internal IPs',
        description: 'Detects SSRF to internal networks',
        pattern: /(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})/,
        severity: 'medium',
        action: 'log'
      },

      // NoSQL Injection Rules
      {
        id: 'NOSQL-001',
        name: 'NoSQL Injection - MongoDB',
        description: 'Detects MongoDB injection',
        pattern: /(\$ne|\$gt|\$lt|\$where|\$regex)/i,
        severity: 'high',
        action: 'block'
      },

      // Header Injection Rules
      {
        id: 'HEADER-001',
        name: 'Header Injection - CRLF',
        description: 'Detects CRLF injection in headers',
        pattern: /(\r\n|\n\r|%0d%0a|%0a%0d)/i,
        severity: 'high',
        action: 'block'
      },

      // File Upload Rules
      {
        id: 'UPLOAD-001',
        name: 'Malicious File Extension',
        description: 'Detects potentially malicious file extensions',
        pattern: /\.(exe|bat|cmd|sh|php|asp|aspx|jsp|dll|so)$/i,
        severity: 'high',
        action: 'block'
      }
    ];
  }

  /**
   * Основной middleware WAF
   */
  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Whitelist для публичных endpoints
        const whitelistedPaths = [
          '/health',
          '/api/health',
          '/api/v1/health',
          '/metrics',
          '/api/metrics',
          '/api/v1/search',
          '/api/v1/analytics/popular-queries',
          '/api/v1/analytics/click',
          '/api/v1/features/environment',
          '/',
          '/favicon.ico'
        ];

        if (whitelistedPaths.includes(req.path)) {
          return next();
        }

        const ip = req.ip || req.socket.remoteAddress || 'unknown';

        // Проверка всех входных данных
        const violations = await this.checkRequest(req);

        if (violations.length > 0) {
          // Логирование нарушений
          await this.logViolations(req, violations);

          // Проверка, нужно ли блокировать
          const shouldBlock = violations.some(v => v.action === 'block');

          if (shouldBlock) {
            // Блокировка IP при критических нарушениях
            const criticalViolations = violations.filter(v => v.severity === 'critical');
            if (criticalViolations.length > 0) {
              await intrusionPreventionService.blockIP(ip, 'waf_critical_violation', 3600);
            }

            return res.status(403).json({
              error: 'Request blocked by Web Application Firewall',
              code: 'WAF_BLOCKED',
              requestId: req.headers['x-request-id'] || 'unknown'
            });
          }
        }

        next();
      } catch (error) {
        const logger = require('../utils/logger').default;
        logger.error('WAF middleware error:', error);
        next(); // Не блокируем запрос при ошибке WAF
      }
    };
  }

  /**
   * Проверка запроса на нарушения
   */
  private async checkRequest(req: Request): Promise<WAFRule[]> {
    const violations: WAFRule[] = [];

    // Проверка URL (только path, без query string)
    const urlPath = req.path;
    for (const rule of this.rules) {
      if (rule.pattern.test(urlPath)) {
        violations.push(rule);
      }
    }

    // Проверка query параметров (исключаем безопасные параметры)
    const safeQueryParams = ['q', 'sort', 'page', 'limit', 'minPrice', 'maxPrice', 'minRating'];
    const queryToCheck = Object.entries(req.query)
      .filter(([key]) => !safeQueryParams.includes(key))
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    
    if (Object.keys(queryToCheck).length > 0) {
      const queryString = JSON.stringify(queryToCheck);
      for (const rule of this.rules) {
        if (rule.pattern.test(queryString)) {
          violations.push(rule);
        }
      }
    }

    // Проверка body
    if (req.body) {
      const bodyString = JSON.stringify(req.body);
      for (const rule of this.rules) {
        if (rule.pattern.test(bodyString)) {
          violations.push(rule);
        }
      }
    }

    // Проверка headers
    const headersString = JSON.stringify(req.headers);
    for (const rule of this.rules) {
      if (rule.pattern.test(headersString)) {
        violations.push(rule);
      }
    }

    // Проверка cookies
    if (req.cookies) {
      const cookiesString = JSON.stringify(req.cookies);
      for (const rule of this.rules) {
        if (rule.pattern.test(cookiesString)) {
          violations.push(rule);
        }
      }
    }

    return violations;
  }

  /**
   * Логирование нарушений WAF
   */
  private async logViolations(req: Request, violations: WAFRule[]): Promise<void> {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    for (const violation of violations) {
      await pool.query(
        `INSERT INTO waf_blocks (
          ip_address, rule_id, rule_description, request_method, 
          request_path, request_headers, request_body, blocked_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          ip,
          violation.id,
          violation.description,
          req.method,
          req.path,
          JSON.stringify(req.headers),
          req.body ? JSON.stringify(req.body).substring(0, 1000) : null
        ]
      );
    }
  }

  /**
   * Получение статистики WAF
   */
  async getWAFStats(hours: number = 24): Promise<any> {
    const result = await pool.query(
      `SELECT 
        rule_id,
        rule_description,
        COUNT(*) as block_count,
        COUNT(DISTINCT ip_address) as unique_ips
       FROM waf_blocks
       WHERE blocked_at > NOW() - INTERVAL '${hours} hours'
       GROUP BY rule_id, rule_description
       ORDER BY block_count DESC
       LIMIT 20`,
      []
    );

    return result.rows;
  }

  /**
   * Получение топ заблокированных IP
   */
  async getTopBlockedIPs(hours: number = 24, limit: number = 10): Promise<any> {
    const result = await pool.query(
      `SELECT 
        ip_address,
        COUNT(*) as block_count,
        array_agg(DISTINCT rule_id) as violated_rules
       FROM waf_blocks
       WHERE blocked_at > NOW() - INTERVAL '${hours} hours'
       GROUP BY ip_address
       ORDER BY block_count DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }
}

export default new WAFMiddleware();
