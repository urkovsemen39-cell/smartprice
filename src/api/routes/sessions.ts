import { Router, Request, Response } from 'express';
import { sessionService } from '../../services/auth/sessionService';
import { authenticateToken } from '../../middleware/auth';
import { auditService } from '../../services/audit/auditService';

const router = Router();

// Получение всех активных сессий
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const sessions = await sessionService.getUserSessions(userId);

    res.json({ sessions });
  } catch (error) {
    console.error('Error getting sessions:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Завершение конкретной сессии
router.delete('/:sessionId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { sessionId } = req.params;

    const terminated = await sessionService.terminateSession(userId, sessionId);

    if (terminated) {
      await auditService.log({
        userId,
        action: 'session.terminate',
        resourceType: 'session',
        resourceId: sessionId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({ success: true, message: 'Session terminated' });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (error) {
    console.error('Error terminating session:', error);
    res.status(500).json({ error: 'Failed to terminate session' });
  }
});

// Завершение всех сессий кроме текущей
router.delete('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const currentSessionId = (req as any).sessionID;

    const count = await sessionService.terminateAllOtherSessions(userId, currentSessionId);

    await auditService.log({
      userId,
      action: 'session.terminate',
      details: { terminatedCount: count },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ 
      success: true, 
      message: `${count} session(s) terminated`,
      count 
    });
  } catch (error) {
    console.error('Error terminating sessions:', error);
    res.status(500).json({ error: 'Failed to terminate sessions' });
  }
});

export default router;
