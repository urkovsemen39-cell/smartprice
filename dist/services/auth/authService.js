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
const auditService_1 = require("../audit/auditService");
const queueService_1 = require("../queue/queueService");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production environment');
    }
    console.warn('⚠️ JWT_SECRET not set, using default (NOT FOR PRODUCTION)');
}
const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60; // 15 минут в секундах
class AuthService {
    // Проверка сложности пароля
    validatePasswordStrength(password) {
        if (password.length < 8) {
            return { valid: false, message: 'Password must be at least 8 characters' };
        }
        if (password.length > 100) {
            return { valid: false, message: 'Password is too long (max 100 characters)' };
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
        // Проверка на только цифры
        if (/^\d+$/.test(password)) {
            return { valid: false, message: 'Password cannot contain only numbers' };
        }
        // Проверка на только буквы
        if (/^[a-zA-Z]+$/.test(password)) {
            return { valid: false, message: 'Password must contain numbers or special characters' };
        }
        // Проверка на распространенные пароли
        const commonPasswords = ['password', '12345678', '123456789', 'qwerty', 'abc123', 'password123', 'qwerty123'];
        if (commonPasswords.includes(password.toLowerCase())) {
            return { valid: false, message: 'Password is too common, please choose a stronger one' };
        }
        return { valid: true };
    }
    // Проверка блокировки аккаунта
    async checkAccountLockout(email) {
        const key = `login_attempts:${email.toLowerCase()}`;
        const attempts = await redis_1.redisClient.get(key);
        if (attempts && parseInt(attempts) >= MAX_LOGIN_ATTEMPTS) {
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
            await redis_1.redisClient.expire(key, LOCKOUT_DURATION);
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
            console.error('❌ Failed to log login attempt:', error);
        }
    }
    async register(email, password, name, ip, userAgent) {
        try {
            // Валидация email
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(email)) {
                throw new Error('Invalid email format');
            }
            // Проверка на одноразовые email
            const disposableEmailDomains = ['tempmail.com', 'throwaway.email', '10minutemail.com', 'guerrillamail.com'];
            const emailDomain = email.split('@')[1]?.toLowerCase();
            if (disposableEmailDomains.includes(emailDomain)) {
                throw new Error('Disposable email addresses are not allowed');
            }
            // Валидация пароля
            const passwordValidation = this.validatePasswordStrength(password);
            if (!passwordValidation.valid) {
                throw new Error(passwordValidation.message);
            }
            // Проверяем существование пользователя
            const existingUser = await database_1.default.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
            if (existingUser.rows.length > 0) {
                throw new Error('User with this email already exists');
            }
            // Хэшируем пароль
            const passwordHash = await bcrypt_1.default.hash(password, SALT_ROUNDS);
            // Создаем пользователя (email_verified = false по умолчанию)
            const result = await database_1.default.query('INSERT INTO users (email, password_hash, name, email_verified) VALUES ($1, $2, $3, false) RETURNING id, email, name, created_at, email_verified', [email.toLowerCase().trim(), passwordHash, name?.trim()]);
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
                data: { code: '' }, // Код будет сгенерирован в emailVerificationService
            });
            // Отправка кода верификации
            await emailVerificationService_1.emailVerificationService.sendVerificationCode(user.id, user.email);
            // Отправляем welcome email через очередь
            await queueService_1.queueService.addEmailJob({
                type: 'welcome',
                to: user.email,
                data: { name: user.name },
            });
            // Генерируем токен
            const accessToken = this.generateToken(user.id, user.email_verified);
            return {
                accessToken,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    created_at: user.created_at,
                },
            };
        }
        catch (error) {
            console.error('❌ Registration error:', error);
            throw error;
        }
    }
    async login(email, password, ip, userAgent, sessionId) {
        try {
            // Проверяем блокировку аккаунта
            const lockout = await this.checkAccountLockout(email);
            if (lockout.locked) {
                const minutes = Math.ceil((lockout.remainingTime || 0) / 60);
                throw new Error(`Account temporarily locked. Try again in ${minutes} minutes`);
            }
            // Находим пользователя
            const result = await database_1.default.query('SELECT id, email, name, password_hash, created_at, email_verified FROM users WHERE email = $1', [email.toLowerCase().trim()]);
            if (result.rows.length === 0) {
                await this.recordFailedLogin(email);
                await this.logLoginAttempt(email, false, ip, userAgent);
                // Логирование в audit
                await auditService_1.auditService.log({
                    action: 'user.login',
                    ipAddress: ip,
                    userAgent,
                    details: { success: false, email },
                });
                throw new Error('Invalid email or password');
            }
            const user = result.rows[0];
            // Проверяем пароль
            const isValidPassword = await bcrypt_1.default.compare(password, user.password_hash);
            if (!isValidPassword) {
                const attempts = await this.recordFailedLogin(email);
                await this.logLoginAttempt(email, false, ip, userAgent);
                // Логирование в audit
                await auditService_1.auditService.log({
                    userId: user.id,
                    action: 'user.login',
                    ipAddress: ip,
                    userAgent,
                    details: { success: false },
                });
                const remaining = MAX_LOGIN_ATTEMPTS - attempts;
                if (remaining > 0) {
                    throw new Error(`Invalid email or password. ${remaining} attempts remaining`);
                }
                else {
                    throw new Error('Account temporarily locked due to too many failed attempts');
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
            // Генерируем токен
            const accessToken = this.generateToken(user.id, user.email_verified);
            return {
                accessToken,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    created_at: user.created_at,
                },
            };
        }
        catch (error) {
            console.error('❌ Login error:', error);
            throw error;
        }
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
            console.error('❌ Get user error:', error);
            return null;
        }
    }
    verifyToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET || 'fallback-secret-key');
            return decoded;
        }
        catch (error) {
            console.error('❌ Token verification error:', error);
            return null;
        }
    }
    generateToken(userId, emailVerified = false) {
        return jsonwebtoken_1.default.sign({ userId, emailVerified }, JWT_SECRET || 'fallback-secret-key', { expiresIn: JWT_EXPIRES_IN });
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
exports.default = exports.authService;
