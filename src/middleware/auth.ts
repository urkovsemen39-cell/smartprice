import { Request, Response, NextFunction } from 'express';
import authService from '../services/auth/authService';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { HTTP_STATUS } from '../config/constants';

export interface AuthRequest extends Request {
  userId?: number;
  user?: {
    id: number;
    email: string;
    emailVerified: boolean;
    role: string;
  };
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.substring(7);
    const decoded = authService.verifyToken(token);

    if (!decoded) {
      throw new AuthenticationError('Invalid or expired token');
    }

    req.userId = decoded.userId;
    
    // Получаем полную информацию о пользователе
    const user = await authService.getUserById(decoded.userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }
    
    req.user = {
      id: user.id,
      email: user.email,
      emailVerified: decoded.emailVerified,
      role: decoded.role,
    };
    
    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
    }
    const logger = require('../utils/logger').default;
    logger.error('Auth middleware error:', error);
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Authentication failed' });
  }
}

export async function optionalAuthMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = authService.verifyToken(token);

      if (decoded) {
        req.userId = decoded.userId;
        
        const user = await authService.getUserById(decoded.userId);
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            emailVerified: decoded.emailVerified,
            role: decoded.role,
          };
        }
      }
    }

    next();
  } catch (error) {
    const logger = require('../utils/logger').default;
    logger.error('Optional auth middleware error:', error);
    next();
  }
}

/**
 * Middleware для проверки роли администратора
 */
export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Authentication required',
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      error: 'Admin access required',
    });
  }

  next();
}

/**
 * Middleware для проверки роли модератора или администратора
 */
export function requireModerator(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Authentication required',
    });
  }

  if (!['admin', 'moderator'].includes(req.user.role)) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      error: 'Moderator or admin access required',
    });
  }

  next();
}

/**
 * Middleware для проверки верификации email
 */
export function requireEmailVerified(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Authentication required',
    });
  }

  if (!req.user.emailVerified) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      error: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }

  next();
}

// Alias for compatibility
export const authenticateToken = authMiddleware;

export default {
  authMiddleware,
  optionalAuthMiddleware,
  requireAdmin,
  requireModerator,
  requireEmailVerified,
  authenticateToken,
};
