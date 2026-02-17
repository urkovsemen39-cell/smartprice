import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../../config/database';
import emailService from '../email/emailService';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production environment');
  }
  console.warn('⚠️ JWT_SECRET not set, using default (NOT FOR PRODUCTION)');
}

const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 12; // Увеличено с 10 до 12 для лучшей безопасности

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
  async register(email: string, password: string, name?: string): Promise<AuthTokens> {
    try {
      // Валидация email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
      }

      // Валидация пароля
      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }
      if (password.length > 100) {
        throw new Error('Password is too long');
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

      // Создаем пользователя
      const result = await db.query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
        [email.toLowerCase().trim(), passwordHash, name?.trim()]
      );

      const user = result.rows[0];

      // Отправляем welcome email (не блокируем регистрацию если не отправится)
      emailService.sendWelcomeEmail(user.email, user.name).catch(err => {
        console.error('❌ Failed to send welcome email:', err);
      });

      // Генерируем токен
      const accessToken = this.generateToken(user.id);

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

  async login(email: string, password: string): Promise<AuthTokens> {
    try {
      // Находим пользователя
      const result = await db.query(
        'SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1',
        [email.toLowerCase().trim()]
      );

      if (result.rows.length === 0) {
        throw new Error('Invalid email or password');
      }

      const user = result.rows[0];

      // Проверяем пароль
      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }

      // Генерируем токен
      const accessToken = this.generateToken(user.id);

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

  private generateToken(userId: number): string {
    return jwt.sign({ userId }, JWT_SECRET || 'fallback-secret-key', { expiresIn: JWT_EXPIRES_IN });
  }
}

export default new AuthService();
