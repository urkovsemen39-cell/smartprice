import { Router, Request, Response } from 'express';
import { pool } from '../../config/database';
import logger from '../../utils/logger';

const router = Router();

/**
 * Временный endpoint для назначения админа
 * После использования удалить!
 */
router.post('/make-admin', async (req: Request, res: Response) => {
  try {
    const { email, secret } = req.body;
    
    // Простая защита - требуем секретный ключ
    if (secret !== 'setup-admin-2026') {
      return res.status(403).json({ error: 'Invalid secret' });
    }
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
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
    
    logger.info(`Admin role granted to ${result.rows[0].email}`);
    
    res.json({
      success: true,
      message: 'Admin role granted successfully',
      user: result.rows[0]
    });
    
  } catch (error) {
    logger.error('Make admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
