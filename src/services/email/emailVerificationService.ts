import crypto from 'crypto';
import { pool } from '../../config/database';
import { redisClient } from '../../config/redis';
import { emailService } from './emailService';
import { setWithExpiry } from '../../utils/redisHelpers';

class EmailVerificationService {
  // Генерация 6-значного кода
  generateCode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  // Отправка кода верификации
  async sendVerificationCode(userId: number, email: string): Promise<boolean> {
    try {
      // Проверка rate limit (1 запрос в минуту)
      const resendKey = `email_resend_limit:${userId}`;
      const canResend = await redisClient.get(resendKey);
      
      if (canResend) {
        throw new Error('Please wait before requesting a new code');
      }

      // Генерация кода
      const code = this.generateCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 минут

      // Сохранение в Redis
      const verificationKey = `email_verification:${userId}`;
      await setWithExpiry(verificationKey, code, 900); // 15 минут

      // Сохранение в БД для истории
      await pool.query(
        `INSERT INTO email_verifications (user_id, code, expires_at) 
         VALUES ($1, $2, $3)`,
        [userId, code, expiresAt]
      );

      // Установка rate limit
      await setWithExpiry(resendKey, '1', 60); // 1 минута

      // Отправка email
      await emailService.sendVerificationEmail(email, code);

      console.log(`✅ Verification code sent to user ${userId}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending verification code:', error);
      throw error;
    }
  }

  // Проверка кода
  async verifyCode(userId: number, code: string): Promise<boolean> {
    try {
      // Проверка количества попыток
      const attemptsKey = `email_verification_attempts:${userId}`;
      const attempts = await redisClient.get(attemptsKey);
      const attemptCount = attempts ? parseInt(attempts) : 0;

      if (attemptCount >= 5) {
        throw new Error('Too many failed attempts. Please request a new code');
      }

      // Получение кода из Redis
      const verificationKey = `email_verification:${userId}`;
      const storedCode = await redisClient.get(verificationKey);

      if (!storedCode) {
        throw new Error('Verification code expired or not found');
      }

      if (storedCode !== code) {
        // Увеличение счетчика попыток
        await setWithExpiry(attemptsKey, (attemptCount + 1).toString(), 3600);
        throw new Error('Invalid verification code');
      }

      // Код правильный - обновление пользователя
      await pool.query(
        `UPDATE users 
         SET email_verified = true, email_verified_at = NOW() 
         WHERE id = $1`,
        [userId]
      );

      // Обновление записи в БД
      await pool.query(
        `UPDATE email_verifications 
         SET verified = true 
         WHERE user_id = $1 AND code = $2`,
        [userId, code]
      );

      // Очистка Redis
      await redisClient.del(verificationKey);
      await redisClient.del(attemptsKey);

      console.log(`✅ Email verified for user ${userId}`);
      return true;
    } catch (error) {
      console.error('❌ Error verifying code:', error);
      throw error;
    }
  }

  // Проверка статуса верификации
  async isEmailVerified(userId: number): Promise<boolean> {
    const result = await pool.query(
      'SELECT email_verified FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0]?.email_verified || false;
  }
}

export const emailVerificationService = new EmailVerificationService();
