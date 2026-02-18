import { Router, Request, Response } from 'express';
import { emailVerificationService } from '../../services/email/emailVerificationService';
import { authenticateToken } from '../../middleware/auth';
import { auditService } from '../../services/audit/auditService';
import logger from '../../utils/logger';

const router = Router();

// Отправка кода верификации
router.post('/send', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const email = (req as any).user.email;

    // Проверка, не верифицирован ли уже
    const isVerified = await emailVerificationService.isEmailVerified(userId);
    if (isVerified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    await emailVerificationService.sendVerificationCode(userId, email);

    res.json({ 
      success: true, 
      message: 'Verification code sent to your email' 
    });
  } catch (error: any) {
    logger.error('Error sending verification code:', error);
    res.status(500).json({ error: error.message || 'Failed to send verification code' });
  }
});

// Проверка кода
router.post('/verify', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    const verified = await emailVerificationService.verifyCode(userId, code);

    if (verified) {
      // Логирование в audit
      await auditService.log({
        userId,
        action: 'user.email_verify',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({ 
        success: true, 
        message: 'Email verified successfully' 
      });
    }
  } catch (error: any) {
    logger.error('Error verifying code:', error);
    res.status(400).json({ error: error.message || 'Invalid verification code' });
  }
});

// Проверка статуса верификации
router.get('/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const isVerified = await emailVerificationService.isEmailVerified(userId);

    res.json({ verified: isVerified });
  } catch (error) {
    logger.error('Error checking verification status:', error);
    res.status(500).json({ error: 'Failed to check verification status' });
  }
});

export default router;
