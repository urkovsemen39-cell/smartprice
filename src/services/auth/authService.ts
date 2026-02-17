import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../../config/database';
import { emailService } from '../email/emailService';
import { redisClient } from '../../config/redis';
import { emailVerificationService } from '../email/emailVerificationService';
import { sessionService } from './sessionService';
import { auditService } from '../audit/auditService';
import { queueService } from '../queue/queueService';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production environment');
  }
  console.warn('⚠️ JWT_SECRET not set, using default (NOT FOR PRODUCTION)');
}

const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60; // 15 минут в секундах

export interface User {
  id: number;
  email: string;
  name?: string;
  created_at: Date;
}

export interface AuthTokens {
  accessToken: string;
  user: User;
}

export class AuthService {
  // Проверка сложности пароля
  private validatePasswordStrength(password: string): { valid: boolean; message?: string } {
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters' };
    }
    if (password.length > 100) {
      return { valid: false, message: 'Password is too long (max 100 characters)' };
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

    // Проверка на только цифры
    if (/^\d+$/.test(password)) {
      return { valid: false, message: 'Password cannot contain only numbers' };
    }

    // Проверка на только буквы
    if (/^[a-zA-Z]+$/.test(password)) {
      return { valid: false, message: 'Password must contain numbers or special characters' };
    }

    // Проверка на распространенные пароли
    const commonPasswords = ['password', '12345678', '123456789', 'qwerty', 'abc123', 'password123', 'qwerty123'];
    if (commonPasswords.includes(password.toLowerCase())) {
      return { valid: false, message: 'Password is too common, please choose a stronger one' };
    }

    return { valid: true };
  }

  // Проверка блокировки аккаунта
  private async checkAccountLockout(email: string): Promise<{ locked: boolean; remainingTime?: number }> {
    const key = `login_attempts:${email.toLowerCase()}`;
    const attempts = await redisClient.get(key);
    
    if (attempts && parseInt(attempts) >= MAX_LOGIN_ATTEMPTS) {
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
      await redisClient.expire(key, LOCKOUT_DURATION);
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
      console.error('❌ Failed to log login attempt:', error);
    }
  }

  async register(email: string, password: string, name?: string, ip?: string, userAgent?: string): Promise<AuthTokens> {
    try {
      // Валидация email
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
      }

      // Проверка на одноразовые email
      const disposableEmailDomains = ['tempmail.com', 'throwaway.email', '10minutemail.com', 'guerrillamail.com'];
      const emailDomain = email.split('@')[1]?.toLowerCase();
      if (disposableEmailDomains.includes(emailDomain)) {
        throw new Error('Disposable email addresses are not allowed');
      }

      // Валидация пароля
      const passwordValidation = this.validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        throw new Error(passwordValidation.message);
      }

      // Проверяем существование пользователя
      const existingUser = await db.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase().trim()]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('User with this email already exists');
      }

      // Хэшируем пароль
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Создаем пользователя (email_verified = false по умолчанию)
      const result = await db.query(
        'INSERT INTO users (email, password_hash, name, email_verified) VALUES ($1, $2, $3, false) RETURNING id, email, name, created_at, email_verified',
        [email.toLowerCase().trim(), passwordHash, name?.trim()]
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
        data: { code: '' }, // Код будет сгенерирован в emailVerificationService
      });

      // Отправка кода верификации
      await emailVerificationService.sendVerificationCode(user.id, user.email);

      // Отправляем welcome email через очередь
      await queueService.addEmailJob({
        type: 'welcome',
        to: user.email,
        data: { name: user.name },
      });

      // Генерируем токен
      const accessToken = this.generateToken(user.id, user.email_verified);

      return {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          created_at: user.created_at,
        },
      };
    } catch (error) {
      console.error('❌ Registration error:', error);
      throw error;
    }
  }

  async login(email: string, password: string, ip?: string, userAgent?: string, sessionId?: string): Promise<AuthTokens> {
    try {
      // Проверяем блокировку аккаунта
      const lockout = await this.checkAccountLockout(email);
      if (lockout.locked) {
        const minutes = Math.ceil((lockout.remainingTime || 0) / 60);
        throw new Error(`Account temporarily locked. Try again in ${minutes} minutes`);
      }

      // Находим пользователя
      const result = await db.query(
        'SELECT id, email, name, password_hash, created_at, email_verified FROM users WHERE email = $1',
        [email.toLowerCase().trim()]
      );

      if (result.rows.length === 0) {
        await this.recordFailedLogin(email);
        await this.logLoginAttempt(email, false, ip, userAgent);
        
        // Логирование в audit
        await auditService.log({
          action: 'user.login',
          ipAddress: ip,
          userAgent,
          details: { success: false, email },
        });
        
        throw new Error('Invalid email or password');
      }

      const user = result.rows[0];

      // Проверяем пароль
      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        const attempts = await this.recordFailedLogin(email);
        await this.logLoginAttempt(email, false, ip, userAgent);
        
        // Логирование в audit
        await auditService.log({
          userId: user.id,
          action: 'user.login',
          ipAddress: ip,
          userAgent,
          details: { success: false },
        });
        
        const remaining = MAX_LOGIN_ATTEMPTS - attempts;
        if (remaining > 0) {
          throw new Error(`Invalid email or password. ${remaining} attempts remaining`);
        } else {
          throw new Error('Account temporarily locked due to too many failed attempts');
        }
      }

      // Успешный вход - сбрасываем счетчик
      await this.resetLoginAttempts(email);
      await this.logLoginAttempt(email, true, ip, userAgent);

      // Создание сессии
      if (sessionId && ip && userAgent) {
        await sessionService.createSession(user.id, sessionId, ip, userAgent, user.email);
      }

      // Логирование в audit
      await auditService.log({
        userId: user.id,
        action: 'user.login',
        ipAddress: ip,
        userAgent,
        details: { success: true },
      });

      // Генерируем токен
      const accessToken = this.generateToken(user.id, user.email_verified);

      return {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          created_at: user.created_at,
        },
      };
    } catch (error) {
      console.error('❌ Login error:', error);
      throw error;
    }
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
      console.error('❌ Get user error:', error);
      return null;
    }
  }

  verifyToken(token: string): { userId: number } | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET || 'fallback-secret-key') as { userId: number };
      return decoded;
    } catch (error) {
      console.error('❌ Token verification error:', error);
      return null;
    }
  }

  private generateToken(userId: number, emailVerified: boolean = false): string {
    return jwt.sign(
      { userId, emailVerified }, 
      JWT_SECRET || 'fallback-secret-key', 
      { expiresIn: JWT_EXPIRES_IN }
    );
  }
}

export const authService = new AuthService();
export default authService;
