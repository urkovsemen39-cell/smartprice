import { Router, Request, Response } from 'express';
import { apiKeyService } from '../../services/auth/apiKeyService';
import { authenticateToken } from '../../middleware/auth';
import { auditService } from '../../services/audit/auditService';
import Pagination from '../../utils/pagination';
import logger from '../../utils/logger';

const router = Router();

// Создание нового API ключа
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { name, expiresInDays } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Key name is required' });
    }

    const { key, id } = await apiKeyService.createApiKey(userId, name, expiresInDays);

    await auditService.log({
      userId,
      action: 'user.api_key_create',
      resourceType: 'api_key',
      resourceId: id.toString(),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ 
      success: true, 
      key, // Показываем ключ только один раз!
      id,
      message: 'API key created. Save it securely, it will not be shown again.' 
    });
  } catch (error) {
    logger.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Получение всех ключей пользователя (с пагинацией)
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { page, limit, offset } = Pagination.parseParams(req.query);

    const keys = await apiKeyService.getUserKeys(userId, limit, offset);
    const total = await apiKeyService.getUserKeysCount(userId);

    const result = Pagination.createResult(keys, total, page, limit);

    res.json(result);
  } catch (error) {
    logger.error('Error getting API keys:', error);
    res.status(500).json({ error: 'Failed to get API keys' });
  }
});

// Отзыв ключа
router.delete('/:keyId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const keyId = parseInt(req.params.keyId);

    const revoked = await apiKeyService.revokeKey(userId, keyId);

    if (revoked) {
      await auditService.log({
        userId,
        action: 'user.api_key_revoke',
        resourceType: 'api_key',
        resourceId: keyId.toString(),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({ success: true, message: 'API key revoked' });
    } else {
      res.status(404).json({ error: 'API key not found' });
    }
  } catch (error) {
    logger.error('Error revoking API key:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// Статистика использования ключа
router.get('/:keyId/stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    const keyId = parseInt(req.params.keyId);
    const days = parseInt(req.query.days as string) || 7;

    const stats = await apiKeyService.getKeyStats(keyId, days);

    res.json({ stats });
  } catch (error) {
    logger.error('Error getting key stats:', error);
    res.status(500).json({ error: 'Failed to get key stats' });
  }
});

export default router;
