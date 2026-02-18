"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authService_1 = __importDefault(require("../../services/auth/authService"));
const auth_1 = require("../../middleware/auth");
const errors_1 = require("../../utils/errors");
const constants_1 = require("../../config/constants");
const router = (0, express_1.Router)();
/**
 * Регистрация нового пользователя
 */
router.post('/register', (0, errors_1.asyncHandler)(async (req, res) => {
    const { email, password, name } = req.body;
    // Валидация
    if (!email || typeof email !== 'string') {
        throw new errors_1.ValidationError('Valid email is required');
    }
    if (!password || typeof password !== 'string') {
        throw new errors_1.ValidationError('Valid password is required');
    }
    if (password.length < constants_1.AUTH.PASSWORD_MIN_LENGTH) {
        throw new errors_1.ValidationError(`Password must be at least ${constants_1.AUTH.PASSWORD_MIN_LENGTH} characters`);
    }
    if (password.length > constants_1.AUTH.PASSWORD_MAX_LENGTH) {
        throw new errors_1.ValidationError(`Password is too long (max ${constants_1.AUTH.PASSWORD_MAX_LENGTH} characters)`);
    }
    if (name && typeof name !== 'string') {
        throw new errors_1.ValidationError('Name must be a string');
    }
    if (name && name.length > 255) {
        throw new errors_1.ValidationError('Name is too long (max 255 characters)');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new errors_1.ValidationError('Invalid email format');
    }
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const result = await authService_1.default.register(email, password, name, ip, userAgent);
    // Устанавливаем refresh token в httpOnly cookie
    res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    res.status(constants_1.HTTP_STATUS.CREATED).json({
        accessToken: result.accessToken,
        user: result.user,
    });
}));
/**
 * Вход пользователя
 */
router.post('/login', (0, errors_1.asyncHandler)(async (req, res) => {
    const { email, password } = req.body;
    if (!email || typeof email !== 'string') {
        throw new errors_1.ValidationError('Valid email is required');
    }
    if (!password || typeof password !== 'string') {
        throw new errors_1.ValidationError('Valid password is required');
    }
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const sessionId = req.sessionID;
    const result = await authService_1.default.login(email, password, ip, userAgent, sessionId);
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
router.post('/refresh', (0, errors_1.asyncHandler)(async (req, res) => {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if (!refreshToken) {
        throw new errors_1.ValidationError('Refresh token is required');
    }
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const result = await authService_1.default.refreshAccessToken(refreshToken, ip, userAgent);
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
router.post('/logout', auth_1.authMiddleware, (0, errors_1.asyncHandler)(async (req, res) => {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if (refreshToken && req.userId) {
        await authService_1.default.logout(refreshToken, req.userId);
    }
    // Удаляем refresh token cookie
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
}));
/**
 * Выход со всех устройств
 */
router.post('/logout-all', auth_1.authMiddleware, (0, errors_1.asyncHandler)(async (req, res) => {
    if (!req.userId) {
        throw new errors_1.ValidationError('User ID is required');
    }
    await authService_1.default.logoutAll(req.userId);
    // Удаляем refresh token cookie
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out from all devices successfully' });
}));
/**
 * Получение информации о текущем пользователе
 */
router.get('/me', auth_1.authMiddleware, (0, errors_1.asyncHandler)(async (req, res) => {
    if (!req.userId) {
        throw new errors_1.ValidationError('User ID is required');
    }
    const user = await authService_1.default.getUserById(req.userId);
    if (!user) {
        res.status(constants_1.HTTP_STATUS.NOT_FOUND).json({ error: 'User not found' });
        return;
    }
    res.json({ user });
}));
/**
 * Смена пароля
 */
router.post('/change-password', auth_1.authMiddleware, (0, errors_1.asyncHandler)(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!req.userId) {
        throw new errors_1.ValidationError('User ID is required');
    }
    if (!currentPassword || typeof currentPassword !== 'string') {
        throw new errors_1.ValidationError('Current password is required');
    }
    if (!newPassword || typeof newPassword !== 'string') {
        throw new errors_1.ValidationError('New password is required');
    }
    if (newPassword.length < constants_1.AUTH.PASSWORD_MIN_LENGTH) {
        throw new errors_1.ValidationError(`Password must be at least ${constants_1.AUTH.PASSWORD_MIN_LENGTH} characters`);
    }
    if (newPassword.length > constants_1.AUTH.PASSWORD_MAX_LENGTH) {
        throw new errors_1.ValidationError(`Password is too long (max ${constants_1.AUTH.PASSWORD_MAX_LENGTH} characters)`);
    }
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    await authService_1.default.changePassword(req.userId, currentPassword, newPassword, ip, userAgent);
    // Удаляем refresh token cookie так как все токены отозваны
    res.clearCookie('refreshToken');
    res.json({
        message: 'Password changed successfully. Please log in again.',
        requiresReauth: true,
    });
}));
exports.default = router;
