import { Router, Request, Response } from 'express';
import authService from '../../services/auth/authService';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { asyncHandler, ValidationError } from '../../utils/errors';
import { AUTH, HTTP_STATUS } from '../../config/constants';

const router = Router();

/**
 * Регистрация нового пользователя
 */
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  // Валидация
  if (!email || typeof email !== 'string') {
    throw new ValidationError('Valid email is required');
  }
  if (!password || typeof password !== 'string') {
    throw new ValidationError('Valid password is required');
  }
  if (password.length < AUTH.PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > AUTH.PASSWORD_MAX_LENGTH) {
    throw new ValidationError(`Password is too long (max ${AUTH.PASSWORD_MAX_LENGTH} characters)`);
  }
  if (name && typeof name !== 'string') {
    throw new ValidationError('Name must be a string');
  }
  if (name && name.length > 255) {
    throw new ValidationError('Name is too long (max 255 characters)');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const result = await authService.register(email, password, name, ip, userAgent);
  
  // Устанавливаем refresh token в httpOnly cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.status(HTTP_STATUS.CREATED).json({
    accessToken: result.accessToken,
    user: result.user,
  });
}));

/**
 * Вход пользователя
 */
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string') {
    throw new ValidationError('Valid email is required');
  }
  if (!password || typeof password !== 'string') {
    throw new ValidationError('Valid password is required');
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const sessionId = req.sessionID || undefined;

  const result = await authService.login(email, password, ip, userAgent, sessionId);
  
  // Устанавливаем refresh token в httpOnly cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.json({
    accessToken: result.accessToken,
    user: result.user,
  });
}));

/**
 * Обновление access token с помощью refresh token
 */
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

  if (!refreshToken) {
    throw new ValidationError('Refresh token is required');
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const result = await authService.refreshAccessToken(refreshToken, ip, userAgent);
  
  // Обновляем refresh token в cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    accessToken: result.accessToken,
  });
}));

/**
 * Выход пользователя
 */
router.post('/logout', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
  
  if (refreshToken && req.userId) {
    await authService.logout(refreshToken, req.userId);
  }

  // Удаляем refresh token cookie
  res.clearCookie('refreshToken');

  res.json({ message: 'Logged out successfully' });
}));

/**
 * Выход со всех устройств
 */
router.post('/logout-all', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new ValidationError('User ID is required');
  }

  await authService.logoutAll(req.userId);

  // Удаляем refresh token cookie
  res.clearCookie('refreshToken');

  res.json({ message: 'Logged out from all devices successfully' });
}));

/**
 * Получение информации о текущем пользователе
 */
router.get('/me', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new ValidationError('User ID is required');
  }

  const user = await authService.getUserById(req.userId);
  
  if (!user) {
    res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'User not found' });
    return;
  }

  res.json({ user });
}));

/**
 * Смена пароля
 */
router.post('/change-password', authMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!req.userId) {
    throw new ValidationError('User ID is required');
  }

  if (!currentPassword || typeof currentPassword !== 'string') {
    throw new ValidationError('Current password is required');
  }

  if (!newPassword || typeof newPassword !== 'string') {
    throw new ValidationError('New password is required');
  }

  if (newPassword.length < AUTH.PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters`);
  }

  if (newPassword.length > AUTH.PASSWORD_MAX_LENGTH) {
    throw new ValidationError(`Password is too long (max ${AUTH.PASSWORD_MAX_LENGTH} characters)`);
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  await authService.changePassword(req.userId, currentPassword, newPassword, ip, userAgent);

  // Удаляем refresh token cookie так как все токены отозваны
  res.clearCookie('refreshToken');

  res.json({ 
    message: 'Password changed successfully. Please log in again.',
    requiresReauth: true,
  });
}));

export default router;
