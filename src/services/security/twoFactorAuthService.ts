import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { pool } from '../../config/database';
import crypto from 'crypto';
import env from '../../config/env';

interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

interface TwoFactorSettings {
  userId: number;
  secret: string;
  enabled: boolean;
  backupCodes: string[];
}

class TwoFactorAuthService {
  private readonly ENCRYPTION_KEY: Buffer;
  private readonly ALGORITHM = 'aes-256-gcm';

  constructor() {
    // Используем JWT_SECRET как основу для ключа шифрования
    const secret = env.JWT_SECRET || 'fallback-secret-key-for-encryption';
    this.ENCRYPTION_KEY = crypto.scryptSync(secret, 'salt', 32);
  }

  /**
   * Шифрование данных
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Возвращаем: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Расшифровка данных
   */
  private decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(this.ALGORITHM, this.ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
  /**
   * Генерация секрета и QR кода для настройки 2FA
   */
  async generateSecret(userId: number, email: string): Promise<TwoFactorSetup> {
    const secret = speakeasy.generateSecret({
      name: `SmartPrice (${email})`,
      issuer: 'SmartPrice',
      length: 32
    });

    // Генерация backup кодов
    const backupCodes = this.generateBackupCodes(8);
    
    // Шифруем backup коды перед сохранением
    const encryptedBackupCodes = this.encrypt(JSON.stringify(backupCodes));

    // Генерация QR кода
    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

    // Сохранение в БД (пока не активировано)
    await pool.query(
      `INSERT INTO user_2fa_settings (user_id, secret, enabled, backup_codes, created_at)
       VALUES ($1, $2, false, $3, NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET secret = $2, backup_codes = $3, updated_at = NOW()`,
      [userId, secret.base32, encryptedBackupCodes]
    );

    return {
      secret: secret.base32,
      qrCode,
      backupCodes
    };
  }

  /**
   * Активация 2FA после проверки кода
   */
  async enable2FA(userId: number, token: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT secret FROM user_2fa_settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('2FA not set up');
    }

    const secret = result.rows[0].secret;
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2 // Допускаем 2 временных окна (±60 секунд)
    });

    if (!verified) {
      return false;
    }

    // Активируем 2FA
    await pool.query(
      'UPDATE user_2fa_settings SET enabled = true, updated_at = NOW() WHERE user_id = $1',
      [userId]
    );

    return true;
  }

  /**
   * Отключение 2FA
   */
  async disable2FA(userId: number, token: string): Promise<boolean> {
    const verified = await this.verifyToken(userId, token);
    if (!verified) {
      return false;
    }

    await pool.query(
      'UPDATE user_2fa_settings SET enabled = false, updated_at = NOW() WHERE user_id = $1',
      [userId]
    );

    return true;
  }

  /**
   * Проверка 2FA токена
   */
  async verifyToken(userId: number, token: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT secret, enabled FROM user_2fa_settings WHERE user_id = $1 AND enabled = true',
      [userId]
    );

    if (result.rows.length === 0) {
      return true; // 2FA не включен
    }

    const secret = result.rows[0].secret;

    // Проверка TOTP токена
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2
    });

    return verified;
  }

  /**
   * Проверка backup кода
   */
  async verifyBackupCode(userId: number, code: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT backup_codes FROM user_2fa_settings WHERE user_id = $1 AND enabled = true',
      [userId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    // Расшифровываем backup коды
    const encryptedBackupCodes = result.rows[0].backup_codes;
    const backupCodes: string[] = JSON.parse(this.decrypt(encryptedBackupCodes));
    const codeIndex = backupCodes.indexOf(code);

    if (codeIndex === -1) {
      return false;
    }

    // Удаляем использованный код
    backupCodes.splice(codeIndex, 1);
    
    // Шифруем обновленный список
    const updatedEncryptedCodes = this.encrypt(JSON.stringify(backupCodes));
    
    await pool.query(
      'UPDATE user_2fa_settings SET backup_codes = $1, updated_at = NOW() WHERE user_id = $2',
      [updatedEncryptedCodes, userId]
    );

    return true;
  }

  /**
   * Проверка, включен ли 2FA для пользователя
   */
  async is2FAEnabled(userId: number): Promise<boolean> {
    const result = await pool.query(
      'SELECT enabled FROM user_2fa_settings WHERE user_id = $1',
      [userId]
    );

    return result.rows.length > 0 && result.rows[0].enabled;
  }

  /**
   * Генерация новых backup кодов
   */
  async regenerateBackupCodes(userId: number): Promise<string[]> {
    const backupCodes = this.generateBackupCodes(8);
    
    // Шифруем backup коды
    const encryptedBackupCodes = this.encrypt(JSON.stringify(backupCodes));

    await pool.query(
      'UPDATE user_2fa_settings SET backup_codes = $1, updated_at = NOW() WHERE user_id = $2',
      [encryptedBackupCodes, userId]
    );

    return backupCodes;
  }

  /**
   * Генерация backup кодов
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
    }
    return codes;
  }

  /**
   * Получение статистики 2FA
   */
  async get2FAStats(): Promise<any> {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN enabled = true THEN 1 END) as enabled_users,
        COUNT(CASE WHEN enabled = false THEN 1 END) as disabled_users
      FROM user_2fa_settings
    `);

    return result.rows[0];
  }
}

export default new TwoFactorAuthService();
