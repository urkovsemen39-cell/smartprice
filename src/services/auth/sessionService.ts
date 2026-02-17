import { pool } from '../../config/database';
import { redisClient } from '../../config/redis';
import { emailService } from '../email/emailService';

interface Session {
  id: number;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  lastActivity: Date;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

class SessionService {
  // Создание новой сессии
  async createSession(
    userId: number,
    sessionId: string,
    ipAddress: string,
    userAgent: string,
    email?: string
  ): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 дней

      await pool.query(
        `INSERT INTO user_sessions 
         (user_id, session_id, ip_address, user_agent, expires_at) 
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, sessionId, ipAddress, userAgent, expiresAt]
      );

      // Отправка уведомления о новом входе
      if (email) {
        await emailService.sendNewSessionAlert(email, ipAddress, userAgent);
      }

      console.log(`✅ Session created for user ${userId}`);
    } catch (error) {
      console.error('❌ Error creating session:', error);
      throw error;
    }
  }

  // Получение всех активных сессий пользователя
  async getUserSessions(userId: number): Promise<Session[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM user_sessions 
         WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
         ORDER BY last_activity DESC`,
        [userId]
      );

      return result.rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        lastActivity: row.last_activity,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        isActive: row.is_active,
      }));
    } catch (error) {
      console.error('❌ Error getting user sessions:', error);
      throw error;
    }
  }

  // Обновление времени последней активности
  async updateLastActivity(sessionId: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE user_sessions 
         SET last_activity = NOW() 
         WHERE session_id = $1`,
        [sessionId]
      );
    } catch (error) {
      console.error('❌ Error updating last activity:', error);
    }
  }

  // Завершение конкретной сессии
  async terminateSession(userId: number, sessionId: string): Promise<boolean> {
    try {
      const result = await pool.query(
        `UPDATE user_sessions 
         SET is_active = false 
         WHERE user_id = $1 AND session_id = $2`,
        [userId, sessionId]
      );

      // Удаление из Redis
      await redisClient.del(`sess:${sessionId}`);

      console.log(`✅ Session ${sessionId} terminated`);
      return result.rowCount > 0;
    } catch (error) {
      console.error('❌ Error terminating session:', error);
      throw error;
    }
  }

  // Завершение всех сессий кроме текущей
  async terminateAllOtherSessions(userId: number, currentSessionId: string): Promise<number> {
    try {
      // Получение всех сессий кроме текущей
      const result = await pool.query(
        `SELECT session_id FROM user_sessions 
         WHERE user_id = $1 AND session_id != $2 AND is_active = true`,
        [userId, currentSessionId]
      );

      // Деактивация в БД
      await pool.query(
        `UPDATE user_sessions 
         SET is_active = false 
         WHERE user_id = $1 AND session_id != $2`,
        [userId, currentSessionId]
      );

      // Удаление из Redis
      for (const row of result.rows) {
        await redisClient.del(`sess:${row.session_id}`);
      }

      console.log(`✅ Terminated ${result.rowCount} sessions for user ${userId}`);
      return result.rowCount;
    } catch (error) {
      console.error('❌ Error terminating sessions:', error);
      throw error;
    }
  }

  // Очистка истекших сессий (запускается периодически)
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await pool.query(
        `UPDATE user_sessions 
         SET is_active = false 
         WHERE (expires_at < NOW() OR last_activity < NOW() - INTERVAL '30 days') 
         AND is_active = true`
      );

      console.log(`✅ Cleaned up ${result.rowCount} expired sessions`);
      return result.rowCount;
    } catch (error) {
      console.error('❌ Error cleaning up sessions:', error);
      return 0;
    }
  }

  // Проверка валидности сессии
  async isSessionValid(sessionId: string): Promise<boolean> {
    try {
      const result = await pool.query(
        `SELECT id FROM user_sessions 
         WHERE session_id = $1 AND is_active = true AND expires_at > NOW()`,
        [sessionId]
      );

      return result.rowCount > 0;
    } catch (error) {
      console.error('❌ Error checking session validity:', error);
      return false;
    }
  }
}

export const sessionService = new SessionService();
