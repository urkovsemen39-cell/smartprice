import { Router, Request, Response } from 'express';
import { pool } from '../../config/database';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import logger from '../../utils/logger';

const router = Router();

/**
 * Временный endpoint для настройки TOTP
 * Работает только для конкретного email
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { email, secret: authSecret } = req.body;
    
    // Защита - только для конкретного email
    const allowedEmail = 'semenbrut007@yandex.ru';
    if (!email || email.toLowerCase().trim() !== allowedEmail) {
      return res.status(403).json({ 
        error: 'Unauthorized',
        code: 'UNAUTHORIZED_EMAIL'
      });
    }
    
    // Простая защита
    if (authSecret !== 'setup-totp-2026') {
      return res.status(403).json({ error: 'Invalid secret' });
    }
    
    // Генерируем TOTP секрет
    const totpSecret = speakeasy.generateSecret({
      name: `SmartPrice (${email})`,
      issuer: 'SmartPrice'
    });
    
    // Генерируем QR код
    const qrCodeUrl = await QRCode.toDataURL(totpSecret.otpauth_url!);
    
    // Сохраняем секрет в базу данных
    await pool.query(
      `UPDATE users 
       SET totp_secret = $1 
       WHERE email = $2`,
      [totpSecret.base32, email.toLowerCase().trim()]
    );
    
    logger.info(`TOTP secret generated for ${email}`);
    
    res.json({
      success: true,
      message: 'TOTP secret generated. Scan QR code with Google Authenticator.',
      qrCode: qrCodeUrl,
      secret: totpSecret.base32,
      manualEntry: totpSecret.base32
    });
    
  } catch (error) {
    logger.error('TOTP setup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
