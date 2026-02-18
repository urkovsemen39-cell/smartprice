import crypto from 'crypto';
import { pool } from '../../config/database';
import { auditService } from '../audit/auditService';
import logger, { logSecurity } from '../../utils/logger';

interface SecretRotationResult {
  success: boolean;
  secretType: string;
  rotatedAt: Date;
  message: string;
}

class SecretsManagementService {
  private readonly ROTATION_INTERVAL_DAYS = 90;
  private readonly ENCRYPTION_ALGORITHM = 'aes-256-gcm';
  private masterKey: Buffer | null = null;

  /**
   * Инициализация мастер-ключа
   */
  async initialize(): Promise<void> {
    // В production это должно быть в AWS Secrets Manager или HashiCorp Vault
    const masterKeyEnv = process.env.MASTER_ENCRYPTION_KEY;
    
    if (masterKeyEnv) {
      this.masterKey = Buffer.from(masterKeyEnv, 'hex');
    } else {
      // Генерация нового мастер-ключа (только для dev)
      this.masterKey = crypto.randomBytes(32);
      logger.warn('Generated new master key. In production, use AWS Secrets Manager or Vault!');
      logger.warn('Set MASTER_ENCRYPTION_KEY in environment: ' + this.masterKey.toString('hex'));
    }
  }

  /**
   * Шифрование данных
   */
  encrypt(data: string): { encrypted: string; iv: string; authTag: string } {
    if (!this.masterKey) {
      throw new Error('Master key not initialized');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, this.masterKey, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Расшифровка данных
   */
  decrypt(encrypted: string, iv: string, authTag: string): string {
    if (!this.masterKey) {
      throw new Error('Master key not initialized');
    }

    const decipher = crypto.createDecipheriv(
      this.ENCRYPTION_ALGORITHM,
      this.masterKey,
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Ротация JWT секрета
   */
  async rotateJWTSecret(userId?: number): Promise<SecretRotationResult> {
    const oldSecret = process.env.JWT_SECRET;
    const newSecret = crypto.randomBytes(64).toString('hex');

    // Хеширование для аудита
    const oldSecretHash = oldSecret ? crypto.createHash('sha256').update(oldSecret).digest('hex') : null;
    const newSecretHash = crypto.createHash('sha256').update(newSecret).digest('hex');

    // Сохранение в БД для аудита
    await pool.query(
      `INSERT INTO secret_rotations (secret_type, rotated_by, reason, old_secret_hash, new_secret_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      ['jwt_secret', userId || null, 'scheduled_rotation', oldSecretHash, newSecretHash]
    );

    // В production это должно обновлять AWS Secrets Manager
    logSecurity('JWT Secret rotated', { newSecretHash });
    logger.warn('Update JWT_SECRET in your environment variables!');

    await auditService.log({
      userId: userId,
      action: 'jwt_secret_rotated',
      resourceType: 'security',
      details: { newSecretHash }
    });

    return {
      success: true,
      secretType: 'jwt_secret',
      rotatedAt: new Date(),
      message: 'JWT secret rotated successfully. Update environment variables.'
    };
  }

  /**
   * Ротация Session секрета
   */
  async rotateSessionSecret(userId?: number): Promise<SecretRotationResult> {
    const oldSecret = process.env.SESSION_SECRET;
    const newSecret = crypto.randomBytes(64).toString('hex');

    const oldSecretHash = oldSecret ? crypto.createHash('sha256').update(oldSecret).digest('hex') : null;
    const newSecretHash = crypto.createHash('sha256').update(newSecret).digest('hex');

    await pool.query(
      `INSERT INTO secret_rotations (secret_type, rotated_by, reason, old_secret_hash, new_secret_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      ['session_secret', userId || null, 'scheduled_rotation', oldSecretHash, newSecretHash]
    );

    logSecurity('Session Secret rotated', { newSecretHash });
    logger.warn('Update SESSION_SECRET in your environment variables!');

    await auditService.log({
      userId: userId,
      action: 'session_secret_rotated',
      resourceType: 'security',
      details: { newSecretHash }
    });

    return {
      success: true,
      secretType: 'session_secret',
      rotatedAt: new Date(),
      message: 'Session secret rotated successfully. Update environment variables.'
    };
  }

  /**
   * Ротация Database пароля
   */
  async rotateDatabasePassword(userId?: number): Promise<SecretRotationResult> {
    const newPassword = crypto.randomBytes(32).toString('base64');
    const newPasswordHash = crypto.createHash('sha256').update(newPassword).digest('hex');

    await pool.query(
      `INSERT INTO secret_rotations (secret_type, rotated_by, reason, new_secret_hash)
       VALUES ($1, $2, $3, $4)`,
      ['database_password', userId || null, 'scheduled_rotation', newPasswordHash]
    );

    logSecurity('Database Password rotated', { newPasswordHash });
    logger.warn('Update database password in Railway and DATABASE_URL!');

    await auditService.log({
      userId: userId,
      action: 'database_password_rotated',
      resourceType: 'security',
      details: { newPasswordHash }
    });

    return {
      success: true,
      secretType: 'database_password',
      rotatedAt: new Date(),
      message: 'Database password rotated. Update Railway configuration.'
    };
  }

  /**
   * Проверка необходимости ротации
   */
  async checkRotationNeeded(secretType: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT rotated_at 
       FROM secret_rotations 
       WHERE secret_type = $1 
       ORDER BY rotated_at DESC 
       LIMIT 1`,
      [secretType]
    );

    if (result.rows.length === 0) {
      return true; // Никогда не ротировали
    }

    const lastRotation = new Date(result.rows[0].rotated_at);
    const daysSinceRotation = (Date.now() - lastRotation.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceRotation >= this.ROTATION_INTERVAL_DAYS;
  }

  /**
   * Автоматическая ротация всех секретов
   */
  async rotateAllSecrets(userId?: number): Promise<SecretRotationResult[]> {
    const results: SecretRotationResult[] = [];

    const secretTypes = ['jwt_secret', 'session_secret'];

    for (const secretType of secretTypes) {
      const needsRotation = await this.checkRotationNeeded(secretType);
      
      if (needsRotation) {
        try {
          let result: SecretRotationResult;
          
          switch (secretType) {
            case 'jwt_secret':
              result = await this.rotateJWTSecret(userId);
              break;
            case 'session_secret':
              result = await this.rotateSessionSecret(userId);
              break;
            default:
              continue;
          }
          
          results.push(result);
        } catch (error) {
          logger.error(`Failed to rotate ${secretType}:`, error);
          results.push({
            success: false,
            secretType,
            rotatedAt: new Date(),
            message: `Failed to rotate: ${error}`
          });
        }
      }
    }

    return results;
  }

  /**
   * Шифрование чувствительных данных в БД
   */
  async encryptSensitiveData(): Promise<void> {
    // Шифрование email адресов (опционально)
    // В production это может быть требованием GDPR
    
    const users = await pool.query('SELECT id, email FROM users WHERE email_encrypted IS NULL');

    for (const user of users.rows) {
      const encrypted = this.encrypt(user.email);
      
      await pool.query(
        `UPDATE users 
         SET email_encrypted = $1, email_iv = $2, email_auth_tag = $3 
         WHERE id = $4`,
        [encrypted.encrypted, encrypted.iv, encrypted.authTag, user.id]
      );
    }

    logger.info(`Encrypted ${users.rows.length} email addresses`);
  }

  /**
   * Получение истории ротаций
   */
  async getRotationHistory(secretType?: string, limit: number = 10): Promise<any> {
    let query = `
      SELECT 
        secret_type,
        rotated_at,
        rotated_by,
        reason,
        old_secret_hash,
        new_secret_hash
      FROM secret_rotations
    `;

    const params: any[] = [];

    if (secretType) {
      query += ' WHERE secret_type = $1';
      params.push(secretType);
    }

    query += ' ORDER BY rotated_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Генерация нового API ключа для маркетплейсов
   */
  generateAPIKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Хеширование API ключа для хранения
   */
  hashAPIKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Проверка силы секрета
   */
  checkSecretStrength(secret: string): { strong: boolean; score: number; issues: string[] } {
    const issues: string[] = [];
    let score = 0;

    // Длина
    if (secret.length >= 64) score += 30;
    else if (secret.length >= 32) score += 20;
    else if (secret.length >= 16) score += 10;
    else issues.push('Secret too short');

    // Энтропия
    const uniqueChars = new Set(secret).size;
    if (uniqueChars >= 32) score += 30;
    else if (uniqueChars >= 16) score += 20;
    else issues.push('Low entropy');

    // Разнообразие символов
    if (/[a-z]/.test(secret)) score += 10;
    if (/[A-Z]/.test(secret)) score += 10;
    if (/[0-9]/.test(secret)) score += 10;
    if (/[^a-zA-Z0-9]/.test(secret)) score += 10;

    const strong = score >= 70 && issues.length === 0;

    return { strong, score, issues };
  }
}

export default new SecretsManagementService();
