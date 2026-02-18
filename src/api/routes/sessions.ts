import { Router, Request, Response } from 'express';
import { sessionService } from '../../services/auth/sessionService';
import { authenticateToken } from '../../middleware/auth';
import { auditService } from '../../services/audit/auditService';
import logger from '../../utils/logger';
import Pagination from '../../utils/pagination';

const router = Router();

// Получение всех активных сессий (с пагинацией)
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { page, limit, offset } = Pagination.parseParams(req.query);

    const sessions = await sessionService.getUserSessions(userId, limit, offset);
    const total = await sessionService.getUserSessionsCount(userId);

    const result = Pagination.createResult(sessions, total, page, limit);

    res.json(result);
  } catch (error) {
    logger.error('Error getting sessions:', error);
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
    logger.error('Error terminating session:', error);
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
    logger.error('Error terminating sessions:', error);
    res.status(500).json({ error: 'Failed to terminate sessions' });
  }
});

export default router;
