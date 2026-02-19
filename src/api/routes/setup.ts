import { Router, Request, Response } from 'express';
import { pool } from '../../config/database';
import logger from '../../utils/logger';

const router = Router();

// Флаг - endpoint сработал только один раз (сброшен для повторного использования)
let setupCompleted = false;

/**
 * Временный endpoint для назначения админа
 * Работает ТОЛЬКО ОДИН РАЗ и только для конкретного email
 */
router.post('/make-admin', async (req: Request, res: Response) => {
  try {
    // Проверка - уже использован?
    if (setupCompleted) {
      return res.status(403).json({ 
        error: 'Setup already completed',
        code: 'SETUP_COMPLETED'
      });
    }
    
    const { email, secret } = req.body;
    
    // Простая защита - требуем секретный ключ
    if (secret !== 'setup-admin-2026') {
      return res.status(403).json({ error: 'Invalid secret' });
    }
    
    // Только для конкретного email
    const allowedEmail = 'semenbrut007@yandex.ru';
    if (!email || email.toLowerCase().trim() !== allowedEmail) {
      return res.status(403).json({ 
        error: 'Unauthorized email',
        code: 'UNAUTHORIZED_EMAIL'
      });
    }
    
    const result = await pool.query(
      `UPDATE users 
       SET role = 'owner' 
       WHERE email = $1 
       RETURNING id, email, role`,
      [email.toLowerCase().trim()]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Помечаем что setup выполнен
    setupCompleted = true;
    
    logger.info(`Owner role granted to ${result.rows[0].email} - setup endpoint now disabled`);
    
    res.json({
      success: true,
      message: 'Owner role granted successfully. This endpoint is now disabled.',
      user: result.rows[0]
    });
    
  } catch (error) {
    logger.error('Make admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Принудительное изменение роли на owner
 */
router.post('/force-owner', async (req: Request, res: Response) => {
  try {
    const { email, secret } = req.body;
    
    if (secret !== 'force-owner-2026') {
      return res.status(403).json({ error: 'Invalid secret' });
    }
    
    if (email !== 'semenbrut007@yandex.ru') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Принудительно меняем роль
    const result = await pool.query(
      `UPDATE users 
       SET role = 'owner' 
       WHERE email = $1 
       RETURNING id, email, role, totp_secret IS NOT NULL as has_totp`,
      [email]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    logger.info(`FORCE: Owner role set for ${result.rows[0].email}`);
    
    res.json({
      success: true,
      message: 'Role changed to owner. Please logout and login again.',
      user: result.rows[0]
    });
    
  } catch (error) {
    logger.error('Force owner error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Проверка текущей роли в базе данных
 */
router.post('/check-role', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    const result = await pool.query(
      `SELECT id, email, role, totp_secret IS NOT NULL as has_totp 
       FROM users 
       WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      success: true,
      user: result.rows[0]
    });
    
  } catch (error) {
    logger.error('Check role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Фикс constraint для owner роли
 */
router.post('/fix-owner-constraint', async (req: Request, res: Response) => {
  try {
    const { secret } = req.body;
    
    if (secret !== 'fix-constraint-2026') {
      return res.status(403).json({ error: 'Invalid secret' });
    }
    
    // Удаляем старый constraint
    await pool.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    `);
    
    // Создаем новый с owner
    await pool.query(`
      ALTER TABLE users ADD CONSTRAINT users_role_check 
      CHECK (role IN ('user', 'admin', 'moderator', 'owner'));
    `);
    
    // Устанавливаем роль owner
    const result = await pool.query(`
      UPDATE users 
      SET role = 'owner',
          email_verified = true,
          email_verified_at = NOW(),
          account_locked = false,
          locked_at = NULL,
          lock_reason = NULL
      WHERE email = 'semenbrut007@yandex.ru'
      RETURNING id, email, role, email_verified, account_locked;
    `);
    
    logger.info('Owner constraint fixed and role set');
    
    res.json({
      success: true,
      message: 'Constraint fixed, owner role set, account verified and unlocked',
      user: result.rows[0]
    });
    
  } catch (error) {
    logger.error('Fix constraint error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
