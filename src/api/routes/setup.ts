import { Router, Request, Response } from 'express';
import { pool } from '../../config/database';
import logger from '../../utils/logger';

const router = Router();

// Флаг - endpoint сработал только один раз
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
       SET role = 'admin' 
       WHERE email = $1 
       RETURNING id, email, role`,
      [email.toLowerCase().trim()]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Помечаем что setup выполнен
    setupCompleted = true;
    
    logger.info(`Admin role granted to ${result.rows[0].email} - setup endpoint now disabled`);
    
    res.json({
      success: true,
      message: 'Admin role granted successfully. This endpoint is now disabled.',
      user: result.rows[0]
    });
    
  } catch (error) {
    logger.error('Make admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
