import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../../config/database';
import { redisClient } from '../../config/redis';
import { emailVerificationService } from '../email/emailVerificationService';
import { sessionService } from './sessionService';
import { refreshTokenService } from './refreshTokenService';
import { auditService } from '../audit/auditService';
import { queueService } from '../queue/queueService';
import { AUTH, VALIDATION } from '../../config/constants';
import { ValidationError, AuthenticationError } from '../../utils/errors';
import env from '../../config/env';
import logger from '../../utils/logger';

// SECURITY: No fallback for JWT_SECRET - must be set in production
if (!env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in environment variables');
}

const JWT_SECRET = env.JWT_SECRET;

export interface User {
  id: number;
  email: string;
  name?: string;
  role?: string;
  created_at: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export class AuthService {
  // Проверка сложности пароля
  private validatePasswordStrength(password: string): { valid: boolean; message?: string } {
    if (password.length < AUTH.PASSWORD_MIN_LENGTH) {
      return { valid: false, message: `Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters` };
    }
    if (password.length > AUTH.PASSWORD_MAX_LENGTH) {
      return { valid: false, message: `Password is too long (max ${AUTH.PASSWORD_MAX_LENGTH} characters)` };
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const strength = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar].filter(Boolean).length;

    if (strength < 3) {
      return { 
        valid: false, 
        message: 'Password must contain at least 3 of: uppercase, lowercase, numbers, special characters' 
      };
    }

    if (/^\d+$/.test(password)) {
      return { valid: false, message: 'Password cannot contain only numbers' };
    }

    if (/^[a-zA-Z]+$/.test(password)) {
      return { valid: false, message: 'Password must contain numbers or special characters' };
    }

    const commonPasswords = VALIDATION.COMMON_PASSWORDS as readonly string[];
    if (commonPasswords.some(p => p === password.toLowerCase())) {
      return { valid: false, message: 'Password is too common, please choose a stronger one' };
    }

    return { valid: true };
  }

  // Проверка блокировки аккаунта
  private async checkAccountLockout(email: string): Promise<{ locked: boolean; remainingTime?: number }> {
    const key = `login_attempts:${email.toLowerCase()}`;
    const attempts = await redisClient.get(key);
    
    if (attempts && parseInt(attempts) >= AUTH.MAX_LOGIN_ATTEMPTS) {
      const ttl = await redisClient.ttl(key);
      return { locked: true, remainingTime: ttl };
    }
    
    return { locked: false };
  }

  // Регистрация неудачной попытки входа
  private async recordFailedLogin(email: string): Promise<number> {
    const key = `login_attempts:${email.toLowerCase()}`;
    const attempts = await redisClient.incr(key);
    
    if (attempts === 1) {
      await redisClient.expire(key, AUTH.LOCKOUT_DURATION);
    }
    
    return attempts;
  }

  // Сброс счетчика попыток входа
  private async resetLoginAttempts(email: string): Promise<void> {
    const key = `login_attempts:${email.toLowerCase()}`;
    await redisClient.del(key);
  }

  // Логирование попытки входа
  private async logLoginAttempt(
    email: string, 
    success: boolean, 
    ip?: string, 
    userAgent?: string
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO login_attempts (email, success, ip_address, user_agent, attempted_at) 
         VALUES ($1, $2, $3, $4, NOW())`,
        [email.toLowerCase(), success, ip || null, userAgent || null]
      );
    } catch (error) {
      logger.error('Failed to log login attempt:', error);
    }
  }

  async register(email: string, password: string, name?: string, ip?: string, userAgent?: string): Promise<AuthTokens> {
    try {
      // Валидация email
      if (!VALIDATION.EMAIL_REGEX.test(email)) {
        throw new ValidationError('Invalid email format');
      }

      // Проверка на одноразовые email
      const emailDomain = email.split('@')[1]?.toLowerCase();
      const disposableDomains = VALIDATION.DISPOSABLE_EMAIL_DOMAINS as readonly string[];
      if (emailDomain && disposableDomains.some(d => d === emailDomain)) {
        throw new ValidationError('Disposable email addresses are not allowed');
      }

      // Валидация пароля
      const passwordValidation = this.validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        throw new ValidationError(passwordValidation.message!);
      }

      // Проверяем существование пользователя
      const existingUser = await db.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase().trim()]
      );

      if (existingUser.rows.length > 0) {
        throw new ValidationError('User with this email already exists');
      }

      // Хэшируем пароль
      const passwordHash = await bcrypt.hash(password, AUTH.SALT_ROUNDS);

      // Создаем пользователя
      const result = await db.query(
        'INSERT INTO users (email, password_hash, name, email_verified, role) VALUES ($1, $2, $3, false, $4) RETURNING id, email, name, created_at, email_verified, role',
        [email.toLowerCase().trim(), passwordHash, name?.trim(), 'user']
      );

      const user = result.rows[0];

      // Логирование регистрации
      await auditService.log({
        userId: user.id,
        action: 'user.register',
        ipAddress: ip,
        userAgent,
      });

      // Отправка кода верификации через очередь
      await queueService.addEmailJob({
        type: 'verification',
        to: user.email,
        data: { code: '' },
      });

      await emailVerificationService.sendVerificationCode(user.id, user.email);

      // Отправляем welcome email через очередь
      await queueService.addEmailJob({
        type: 'welcome',
        to: user.email,
        data: { name: user.name },
      });

      // Генерируем токены
      const accessToken = this.generateAccessToken(user.id, user.email_verified, user.role);
      const refreshToken = await refreshTokenService.generateRefreshToken(user.id, ip, userAgent);

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          created_at: user.created_at,
        },
      };
    } catch (error) {
      logger.error('Registration error:', error);
      throw error;
    }
  }

  async login(email: string, password: string, ip?: string, userAgent?: string, sessionId?: string): Promise<AuthTokens> {
    try {
      logger.info(`Login attempt for email: ${email}`);
      
      // Проверяем блокировку аккаунта
      let lockout: { locked: boolean; remainingTime?: number } = { locked: false, remainingTime: 0 };
      try {
        lockout = await this.checkAccountLockout(email);
      } catch (redisError) {
        logger.error('Redis error in checkAccountLockout:', redisError);
        // Продолжаем без проверки блокировки если Redis недоступен
      }
      
      if (lockout.locked) {
        const minutes = Math.ceil((lockout.remainingTime || 0) / 60);
        throw new AuthenticationError(`Account temporarily locked. Try again in ${minutes} minutes`);
      }

      // Находим пользователя
      const result = await db.query(
        'SELECT id, email, name, password_hash, created_at, email_verified, role FROM users WHERE email = $1',
        [email.toLowerCase().trim()]
      );

      if (result.rows.length === 0) {
        try {
          await this.recordFailedLogin(email);
        } catch (redisError) {
          logger.error('Redis error in recordFailedLogin:', redisError);
        }
        await this.logLoginAttempt(email, false, ip, userAgent);
        
        await auditService.log({
          action: 'user.login',
          ipAddress: ip,
          userAgent,
          details: { success: false, email },
        });
        
        throw new AuthenticationError('Invalid email or password');
      }

      const user = result.rows[0];

      // Проверяем пароль (constant-time comparison через bcrypt)
      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        let attempts = 0;
        try {
          attempts = await this.recordFailedLogin(email);
        } catch (redisError) {
          logger.error('Redis error in recordFailedLogin:', redisError);
        }
        await this.logLoginAttempt(email, false, ip, userAgent);
        
        await auditService.log({
          userId: user.id,
          action: 'user.login',
          ipAddress: ip,
          userAgent,
          details: { success: false },
        });
        
        const remaining = AUTH.MAX_LOGIN_ATTEMPTS - attempts;
        if (remaining > 0 && attempts > 0) {
          throw new AuthenticationError(`Invalid email or password. ${remaining} attempts remaining`);
        } else if (attempts >= AUTH.MAX_LOGIN_ATTEMPTS) {
          throw new AuthenticationError('Account temporarily locked due to too many failed attempts');
        } else {
          throw new AuthenticationError('Invalid email or password');
        }
      }

      // Успешный вход - сбрасываем счетчик
      try {
        await this.resetLoginAttempts(email);
      } catch (redisError) {
        logger.error('Redis error in resetLoginAttempts:', redisError);
      }
      await this.logLoginAttempt(email, true, ip, userAgent);

      // Создание сессии
      if (sessionId && ip && userAgent) {
        try {
          await sessionService.createSession(user.id, sessionId, ip, userAgent, user.email);
        } catch (sessionError) {
          logger.error('Session creation error:', sessionError);
          // Продолжаем без сессии
        }
      }

      // Логирование в audit
      await auditService.log({
        userId: user.id,
        action: 'user.login',
        ipAddress: ip,
        userAgent,
        details: { success: true },
      });

      // Генерируем токены
      const accessToken = this.generateAccessToken(user.id, user.email_verified, user.role);
      const refreshToken = await refreshTokenService.generateRefreshToken(user.id, ip, userAgent);

      logger.info(`Login successful for user: ${user.id}`);

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          created_at: user.created_at,
        },
      };
    } catch (error) {
      logger.error('Login error:', error);
      throw error;
    }
  }

  async refreshAccessToken(refreshToken: string, ip?: string, userAgent?: string): Promise<{ accessToken: string; refreshToken: string }> {
    // Валидация refresh token
    const validation = await refreshTokenService.validateRefreshToken(refreshToken);
    
    if (!validation.valid || !validation.userId) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    // Проверка подозрительной активности
    const suspicious = await refreshTokenService.checkSuspiciousActivity(validation.userId, ip || 'unknown');
    if (suspicious) {
      await auditService.log({
        userId: validation.userId,
        action: 'anomaly_detected',
        ipAddress: ip,
        userAgent,
        details: { type: 'refresh_token_suspicious_activity' },
      });
    }

    // Получаем пользователя
    const user = await this.getUserById(validation.userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Получаем роль пользователя
    const userResult = await db.query(
      'SELECT role, email_verified FROM users WHERE id = $1',
      [validation.userId]
    );

    const { role, email_verified } = userResult.rows[0];

    // Отзываем старый refresh token
    await refreshTokenService.revokeRefreshToken(refreshToken, validation.userId);

    // Генерируем новые токены
    const newAccessToken = this.generateAccessToken(validation.userId, email_verified, role);
    const newRefreshToken = await refreshTokenService.generateRefreshToken(validation.userId, ip, userAgent);

    await auditService.log({
      userId: validation.userId,
      action: 'user.login',
      ipAddress: ip,
      userAgent,
      details: { type: 'token_refresh' },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string, userId: number): Promise<void> {
    await refreshTokenService.revokeRefreshToken(refreshToken, userId);
    
    await auditService.log({
      userId,
      action: 'user.logout',
    });
  }

  async logoutAll(userId: number): Promise<void> {
    await refreshTokenService.revokeAllUserTokens(userId);
    // Завершаем все сессии через terminateAllOtherSessions с пустым sessionId
    const sessions = await sessionService.getUserSessions(userId);
    for (const session of sessions) {
      await sessionService.terminateSession(userId, session.sessionId);
    }
    
    await auditService.log({
      userId,
      action: 'user.logout',
      details: { type: 'logout_all_sessions' },
    });
  }

  async getUserById(userId: number): Promise<User | null> {
    try {
      const result = await db.query(
        'SELECT id, email, name, created_at FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Get user error:', error);
      return null;
    }
  }

  /**
   * Смена пароля с отзывом всех токенов
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    ip?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      // Получаем текущий пароль пользователя
      const result = await db.query(
        'SELECT password_hash, email FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        throw new AuthenticationError('User not found');
      }

      const user = result.rows[0];

      // Проверяем текущий пароль
      const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValidPassword) {
        throw new AuthenticationError('Current password is incorrect');
      }

      // Валидация нового пароля
      const passwordValidation = this.validatePasswordStrength(newPassword);
      if (!passwordValidation.valid) {
        throw new ValidationError(passwordValidation.message!);
      }

      // Проверяем, что новый пароль отличается от старого
      const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
      if (isSamePassword) {
        throw new ValidationError('New password must be different from current password');
      }

      // Хэшируем новый пароль
      const newPasswordHash = await bcrypt.hash(newPassword, AUTH.SALT_ROUNDS);

      // Обновляем пароль
      await db.query(
        'UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2',
        [newPasswordHash, userId]
      );

      // КРИТИЧЕСКИ ВАЖНО: Отзываем все токены и сессии
      await this.logoutAll(userId);

      // Логирование
      await auditService.log({
        userId,
        action: 'user.password_change',
        ipAddress: ip,
        userAgent,
      });

      logger.info(`Password changed for user ${userId}, all tokens revoked`);
    } catch (error) {
      logger.error('Change password error:', error);
      throw error;
    }
  }

  verifyToken(token: string): { userId: number; emailVerified: boolean; role: string } | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; emailVerified: boolean; role: string };
      return decoded;
    } catch (error) {
      return null;
    }
  }

  private generateAccessToken(userId: number, emailVerified: boolean = false, role: string = 'user'): string {
    return jwt.sign(
      { userId, emailVerified, role }, 
      JWT_SECRET, 
      { expiresIn: AUTH.JWT_EXPIRES_IN }
    );
  }
}

export const authService = new AuthService();
export default authService;
