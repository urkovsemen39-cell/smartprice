"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
exports.authMiddleware = authMiddleware;
exports.optionalAuthMiddleware = optionalAuthMiddleware;
exports.requireAdmin = requireAdmin;
exports.requireModerator = requireModerator;
exports.requireEmailVerified = requireEmailVerified;
const authService_1 = __importDefault(require("../services/auth/authService"));
const errors_1 = require("../utils/errors");
const constants_1 = require("../config/constants");
async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new errors_1.AuthenticationError('No token provided');
        }
        const token = authHeader.substring(7);
        const decoded = authService_1.default.verifyToken(token);
        if (!decoded) {
            throw new errors_1.AuthenticationError('Invalid or expired token');
        }
        req.userId = decoded.userId;
        // Получаем полную информацию о пользователе
        const user = await authService_1.default.getUserById(decoded.userId);
        if (!user) {
            throw new errors_1.AuthenticationError('User not found');
        }
        req.user = {
            id: user.id,
            email: user.email,
            emailVerified: decoded.emailVerified,
            role: decoded.role,
        };
        next();
    }
    catch (error) {
        if (error instanceof errors_1.AuthenticationError) {
            return res.status(error.statusCode).json({
                error: error.message,
                code: error.code,
            });
        }
        const logger = require('../utils/logger').default;
        logger.error('Auth middleware error:', error);
        res.status(constants_1.HTTP_STATUS.UNAUTHORIZED).json({ error: 'Authentication failed' });
    }
}
async function optionalAuthMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = authService_1.default.verifyToken(token);
            if (decoded) {
                req.userId = decoded.userId;
                const user = await authService_1.default.getUserById(decoded.userId);
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
    }
    catch (error) {
        const logger = require('../utils/logger').default;
        logger.error('Optional auth middleware error:', error);
        next();
    }
}
/**
 * Middleware для проверки роли администратора
 */
function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(constants_1.HTTP_STATUS.UNAUTHORIZED).json({
            error: 'Authentication required',
        });
    }
    if (req.user.role !== 'admin') {
        return res.status(constants_1.HTTP_STATUS.FORBIDDEN).json({
            error: 'Admin access required',
        });
    }
    next();
}
/**
 * Middleware для проверки роли модератора или администратора
 */
function requireModerator(req, res, next) {
    if (!req.user) {
        return res.status(constants_1.HTTP_STATUS.UNAUTHORIZED).json({
            error: 'Authentication required',
        });
    }
    if (!['admin', 'moderator'].includes(req.user.role)) {
        return res.status(constants_1.HTTP_STATUS.FORBIDDEN).json({
            error: 'Moderator or admin access required',
        });
    }
    next();
}
/**
 * Middleware для проверки верификации email
 */
function requireEmailVerified(req, res, next) {
    if (!req.user) {
        return res.status(constants_1.HTTP_STATUS.UNAUTHORIZED).json({
            error: 'Authentication required',
        });
    }
    if (!req.user.emailVerified) {
        return res.status(constants_1.HTTP_STATUS.FORBIDDEN).json({
            error: 'Email verification required',
            code: 'EMAIL_NOT_VERIFIED',
        });
    }
    next();
}
// Alias for compatibility
exports.authenticateToken = authMiddleware;
exports.default = {
    authMiddleware,
    optionalAuthMiddleware,
    requireAdmin,
    requireModerator,
    requireEmailVerified,
    authenticateToken: exports.authenticateToken,
};
