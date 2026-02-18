"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = __importDefault(require("../../config/database"));
const redis_1 = require("../../config/redis");
const emailVerificationService_1 = require("../email/emailVerificationService");
const sessionService_1 = require("./sessionService");
const refreshTokenService_1 = require("./refreshTokenService");
const auditService_1 = require("../audit/auditService");
const queueService_1 = require("../queue/queueService");
const constants_1 = require("../../config/constants");
const errors_1 = require("../../utils/errors");
const env_1 = __importDefault(require("../../config/env"));
const logger_1 = __importDefault(require("../../utils/logger"));
// SECURITY: No fallback for JWT_SECRET - must be set in production
if (!env_1.default.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in environment variables');
}
const JWT_SECRET = env_1.default.JWT_SECRET;
class AuthService {
    // Проверка сложности пароля
    validatePasswordStrength(password) {
        if (password.length < constants_1.AUTH.PASSWORD_MIN_LENGTH) {
            return { valid: false, message: `Password must be at least ${constants_1.AUTH.PASSWORD_MIN_LENGTH} characters` };
        }
        if (password.length > constants_1.AUTH.PASSWORD_MAX_LENGTH) {
            return { valid: false, message: `Password is too long (max ${constants_1.AUTH.PASSWORD_MAX_LENGTH} characters)` };
        }
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
        const strength = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar].filter(Boolean).length;
        if (strength < 3) {
            return {
                valid: false,
                message: 'Password must contain at least 3 of: uppercase, lowercase, numbers, special characters'
            };
        }
        if (/^\d+$/.test(password)) {
            return { valid: false, message: 'Password cannot contain only numbers' };
        }
        if (/^[a-zA-Z]+$/.test(password)) {
            return { valid: false, message: 'Password must contain numbers or special characters' };
        }
        const commonPasswords = constants_1.VALIDATION.COMMON_PASSWORDS;
        if (commonPasswords.some(p => p === password.toLowerCase())) {
            return { valid: false, message: 'Password is too common, please choose a stronger one' };
        }
        return { valid: true };
    }
    // Проверка блокировки аккаунта
    async checkAccountLockout(email) {
        const key = `login_attempts:${email.toLowerCase()}`;
        const attempts = await redis_1.redisClient.get(key);
        if (attempts && parseInt(attempts) >= constants_1.AUTH.MAX_LOGIN_ATTEMPTS) {
            const ttl = await redis_1.redisClient.ttl(key);
            return { locked: true, remainingTime: ttl };
        }
        return { locked: false };
    }
    // Регистрация неудачной попытки входа
    async recordFailedLogin(email) {
        const key = `login_attempts:${email.toLowerCase()}`;
        const attempts = await redis_1.redisClient.incr(key);
        if (attempts === 1) {
            await redis_1.redisClient.expire(key, constants_1.AUTH.LOCKOUT_DURATION);
        }
        return attempts;
    }
    // Сброс счетчика попыток входа
    async resetLoginAttempts(email) {
        const key = `login_attempts:${email.toLowerCase()}`;
        await redis_1.redisClient.del(key);
    }
    // Логирование попытки входа
    async logLoginAttempt(email, success, ip, userAgent) {
        try {
            await database_1.default.query(`INSERT INTO login_attempts (email, success, ip_address, user_agent, attempted_at) 
         VALUES ($1, $2, $3, $4, NOW())`, [email.toLowerCase(), success, ip || null, userAgent || null]);
        }
        catch (error) {
            logger_1.default.error('Failed to log login attempt:', error);
        }
    }
    async register(email, password, name, ip, userAgent) {
        try {
            // Валидация email
            if (!constants_1.VALIDATION.EMAIL_REGEX.test(email)) {
                throw new errors_1.ValidationError('Invalid email format');
            }
            // Проверка на одноразовые email
            const emailDomain = email.split('@')[1]?.toLowerCase();
            const disposableDomains = constants_1.VALIDATION.DISPOSABLE_EMAIL_DOMAINS;
            if (emailDomain && disposableDomains.some(d => d === emailDomain)) {
                throw new errors_1.ValidationError('Disposable email addresses are not allowed');
            }
            // Валидация пароля
            const passwordValidation = this.validatePasswordStrength(password);
            if (!passwordValidation.valid) {
                throw new errors_1.ValidationError(passwordValidation.message);
            }
            // Проверяем существование пользователя
            const existingUser = await database_1.default.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
            if (existingUser.rows.length > 0) {
                throw new errors_1.ValidationError('User with this email already exists');
            }
            // Хэшируем пароль
            const passwordHash = await bcrypt_1.default.hash(password, constants_1.AUTH.SALT_ROUNDS);
            // Создаем пользователя
            const result = await database_1.default.query('INSERT INTO users (email, password_hash, name, email_verified, role) VALUES ($1, $2, $3, false, $4) RETURNING id, email, name, created_at, email_verified, role', [email.toLowerCase().trim(), passwordHash, name?.trim(), 'user']);
            const user = result.rows[0];
            // Логирование регистрации
            await auditService_1.auditService.log({
                userId: user.id,
                action: 'user.register',
                ipAddress: ip,
                userAgent,
            });
            // Отправка кода верификации через очередь
            await queueService_1.queueService.addEmailJob({
                type: 'verification',
                to: user.email,
                data: { code: '' },
            });
            await emailVerificationService_1.emailVerificationService.sendVerificationCode(user.id, user.email);
            // Отправляем welcome email через очередь
            await queueService_1.queueService.addEmailJob({
                type: 'welcome',
                to: user.email,
                data: { name: user.name },
            });
            // Генерируем токены
            const accessToken = this.generateAccessToken(user.id, user.email_verified, user.role);
            const refreshToken = await refreshTokenService_1.refreshTokenService.generateRefreshToken(user.id, ip, userAgent);
            return {
                accessToken,
                refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    created_at: user.created_at,
                },
            };
        }
        catch (error) {
            logger_1.default.error('Registration error:', error);
            throw error;
        }
    }
    async login(email, password, ip, userAgent, sessionId) {
        try {
            // Проверяем блокировку аккаунта
            const lockout = await this.checkAccountLockout(email);
            if (lockout.locked) {
                const minutes = Math.ceil((lockout.remainingTime || 0) / 60);
                throw new errors_1.AuthenticationError(`Account temporarily locked. Try again in ${minutes} minutes`);
            }
            // Находим пользователя
            const result = await database_1.default.query('SELECT id, email, name, password_hash, created_at, email_verified, role FROM users WHERE email = $1', [email.toLowerCase().trim()]);
            if (result.rows.length === 0) {
                await this.recordFailedLogin(email);
                await this.logLoginAttempt(email, false, ip, userAgent);
                await auditService_1.auditService.log({
                    action: 'user.login',
                    ipAddress: ip,
                    userAgent,
                    details: { success: false, email },
                });
                throw new errors_1.AuthenticationError('Invalid email or password');
            }
            const user = result.rows[0];
            // Проверяем пароль (constant-time comparison через bcrypt)
            const isValidPassword = await bcrypt_1.default.compare(password, user.password_hash);
            if (!isValidPassword) {
                const attempts = await this.recordFailedLogin(email);
                await this.logLoginAttempt(email, false, ip, userAgent);
                await auditService_1.auditService.log({
                    userId: user.id,
                    action: 'user.login',
                    ipAddress: ip,
                    userAgent,
                    details: { success: false },
                });
                const remaining = constants_1.AUTH.MAX_LOGIN_ATTEMPTS - attempts;
                if (remaining > 0) {
                    throw new errors_1.AuthenticationError(`Invalid email or password. ${remaining} attempts remaining`);
                }
                else {
                    throw new errors_1.AuthenticationError('Account temporarily locked due to too many failed attempts');
                }
            }
            // Успешный вход - сбрасываем счетчик
            await this.resetLoginAttempts(email);
            await this.logLoginAttempt(email, true, ip, userAgent);
            // Создание сессии
            if (sessionId && ip && userAgent) {
                await sessionService_1.sessionService.createSession(user.id, sessionId, ip, userAgent, user.email);
            }
            // Логирование в audit
            await auditService_1.auditService.log({
                userId: user.id,
                action: 'user.login',
                ipAddress: ip,
                userAgent,
                details: { success: true },
            });
            // Генерируем токены
            const accessToken = this.generateAccessToken(user.id, user.email_verified, user.role);
            const refreshToken = await refreshTokenService_1.refreshTokenService.generateRefreshToken(user.id, ip, userAgent);
            return {
                accessToken,
                refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    created_at: user.created_at,
                },
            };
        }
        catch (error) {
            logger_1.default.error('Login error:', error);
            throw error;
        }
    }
    async refreshAccessToken(refreshToken, ip, userAgent) {
        // Валидация refresh token
        const validation = await refreshTokenService_1.refreshTokenService.validateRefreshToken(refreshToken);
        if (!validation.valid || !validation.userId) {
            throw new errors_1.AuthenticationError('Invalid or expired refresh token');
        }
        // Проверка подозрительной активности
        const suspicious = await refreshTokenService_1.refreshTokenService.checkSuspiciousActivity(validation.userId, ip || 'unknown');
        if (suspicious) {
            await auditService_1.auditService.log({
                userId: validation.userId,
                action: 'anomaly_detected',
                ipAddress: ip,
                userAgent,
                details: { type: 'refresh_token_suspicious_activity' },
            });
        }
        // Получаем пользователя
        const user = await this.getUserById(validation.userId);
        if (!user) {
            throw new errors_1.AuthenticationError('User not found');
        }
        // Получаем роль пользователя
        const userResult = await database_1.default.query('SELECT role, email_verified FROM users WHERE id = $1', [validation.userId]);
        const { role, email_verified } = userResult.rows[0];
        // Отзываем старый refresh token
        await refreshTokenService_1.refreshTokenService.revokeRefreshToken(refreshToken, validation.userId);
        // Генерируем новые токены
        const newAccessToken = this.generateAccessToken(validation.userId, email_verified, role);
        const newRefreshToken = await refreshTokenService_1.refreshTokenService.generateRefreshToken(validation.userId, ip, userAgent);
        await auditService_1.auditService.log({
            userId: validation.userId,
            action: 'user.login',
            ipAddress: ip,
            userAgent,
            details: { type: 'token_refresh' },
        });
        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        };
    }
    async logout(refreshToken, userId) {
        await refreshTokenService_1.refreshTokenService.revokeRefreshToken(refreshToken, userId);
        await auditService_1.auditService.log({
            userId,
            action: 'user.logout',
        });
    }
    async logoutAll(userId) {
        await refreshTokenService_1.refreshTokenService.revokeAllUserTokens(userId);
        // Завершаем все сессии через terminateAllOtherSessions с пустым sessionId
        const sessions = await sessionService_1.sessionService.getUserSessions(userId);
        for (const session of sessions) {
            await sessionService_1.sessionService.terminateSession(userId, session.sessionId);
        }
        await auditService_1.auditService.log({
            userId,
            action: 'user.logout',
            details: { type: 'logout_all_sessions' },
        });
    }
    async getUserById(userId) {
        try {
            const result = await database_1.default.query('SELECT id, email, name, created_at FROM users WHERE id = $1', [userId]);
            if (result.rows.length === 0) {
                return null;
            }
            return result.rows[0];
        }
        catch (error) {
            logger_1.default.error('Get user error:', error);
            return null;
        }
    }
    /**
     * Смена пароля с отзывом всех токенов
     */
    async changePassword(userId, currentPassword, newPassword, ip, userAgent) {
        try {
            // Получаем текущий пароль пользователя
            const result = await database_1.default.query('SELECT password_hash, email FROM users WHERE id = $1', [userId]);
            if (result.rows.length === 0) {
                throw new errors_1.AuthenticationError('User not found');
            }
            const user = result.rows[0];
            // Проверяем текущий пароль
            const isValidPassword = await bcrypt_1.default.compare(currentPassword, user.password_hash);
            if (!isValidPassword) {
                throw new errors_1.AuthenticationError('Current password is incorrect');
            }
            // Валидация нового пароля
            const passwordValidation = this.validatePasswordStrength(newPassword);
            if (!passwordValidation.valid) {
                throw new errors_1.ValidationError(passwordValidation.message);
            }
            // Проверяем, что новый пароль отличается от старого
            const isSamePassword = await bcrypt_1.default.compare(newPassword, user.password_hash);
            if (isSamePassword) {
                throw new errors_1.ValidationError('New password must be different from current password');
            }
            // Хэшируем новый пароль
            const newPasswordHash = await bcrypt_1.default.hash(newPassword, constants_1.AUTH.SALT_ROUNDS);
            // Обновляем пароль
            await database_1.default.query('UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2', [newPasswordHash, userId]);
            // КРИТИЧЕСКИ ВАЖНО: Отзываем все токены и сессии
            await this.logoutAll(userId);
            // Логирование
            await auditService_1.auditService.log({
                userId,
                action: 'user.password_change',
                ipAddress: ip,
                userAgent,
            });
            logger_1.default.info(`Password changed for user ${userId}, all tokens revoked`);
        }
        catch (error) {
            logger_1.default.error('Change password error:', error);
            throw error;
        }
    }
    verifyToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            return decoded;
        }
        catch (error) {
            return null;
        }
    }
    generateAccessToken(userId, emailVerified = false, role = 'user') {
        return jsonwebtoken_1.default.sign({ userId, emailVerified, role }, JWT_SECRET, { expiresIn: constants_1.AUTH.JWT_EXPIRES_IN });
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
exports.default = exports.authService;
