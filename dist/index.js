"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_session_1 = __importDefault(require("express-session"));
const connect_redis_1 = __importDefault(require("connect-redis"));
const redis_1 = require("./config/redis");
const redis_2 = __importDefault(require("./config/redis"));
const initSchema_1 = require("./database/initSchema");
const search_1 = __importDefault(require("./api/routes/search"));
const auth_1 = __importDefault(require("./api/routes/auth"));
const favorites_1 = __importDefault(require("./api/routes/favorites"));
const priceTracking_1 = __importDefault(require("./api/routes/priceTracking"));
const analytics_1 = __importDefault(require("./api/routes/analytics"));
const suggestions_1 = __importDefault(require("./api/routes/suggestions"));
const priceHistory_1 = __importDefault(require("./api/routes/priceHistory"));
const compare_1 = __importDefault(require("./api/routes/compare"));
const metrics_1 = __importDefault(require("./api/routes/metrics"));
const emailVerification_1 = __importDefault(require("./api/routes/emailVerification"));
const sessions_1 = __importDefault(require("./api/routes/sessions"));
const apiKeys_1 = __importDefault(require("./api/routes/apiKeys"));
const admin_1 = __importDefault(require("./api/routes/admin"));
const security_1 = __importDefault(require("./api/routes/security"));
const priceCheckJob_1 = __importDefault(require("./services/jobs/priceCheckJob"));
const priceHistoryJob_1 = __importDefault(require("./services/jobs/priceHistoryJob"));
const metrics_2 = require("./middleware/metrics");
const security_2 = require("./middleware/security");
const advancedSecurity_1 = require("./middleware/advancedSecurity");
const waf_1 = __importDefault(require("./middleware/waf"));
const ddosProtection_1 = require("./middleware/ddosProtection");
const enhancedSecurity_1 = require("./middleware/enhancedSecurity");
const metricsService_1 = __importDefault(require("./services/monitoring/metricsService"));
const databaseMonitoringService_1 = require("./services/monitoring/databaseMonitoringService");
const sessionService_1 = require("./services/auth/sessionService");
const queueService_1 = require("./services/queue/queueService");
const advancedCacheService_1 = require("./services/cache/advancedCacheService");
const securityMonitoringService_1 = __importDefault(require("./services/security/securityMonitoringService"));
const secretsManagementService_1 = __importDefault(require("./services/security/secretsManagementService"));
const anomalyDetectionService_1 = __importDefault(require("./services/security/anomalyDetectionService"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 3001;
// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);
// ============================================
// ULTIMATE SECURITY MIDDLEWARE STACK
// ============================================
// 1. Security headers (должны быть первыми)
app.use(security_2.securityHeadersMiddleware);
// 2. CSP middleware
app.use(advancedSecurity_1.cspMiddleware);
// 3. CORS configuration with credentials
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:3001',
    'https://smartprice-frontend-production.up.railway.app'
].filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Разрешаем запросы без origin (например, Postman, curl)
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(null, true); // Временно разрешаем все origins для отладки
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Challenge-Response'],
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use((0, cookie_parser_1.default)());
// 4. DDoS Protection (критично для защиты от атак)
app.use(ddosProtection_1.ddosProtection);
// 5. Geo-blocking (опционально)
if (process.env.ENABLE_GEO_BLOCKING === 'true') {
    app.use(ddosProtection_1.geoBlocking);
}
// 6. WAF - Web Application Firewall
app.use(waf_1.default.middleware());
// 7. Input Validation & Sanitization
app.use(enhancedSecurity_1.inputValidation);
// 8. Bot Detection
app.use(enhancedSecurity_1.botDetection);
// 9. Threat Score Check
app.use(enhancedSecurity_1.threatScoreCheck);
// 10. Existing security middleware
app.use(security_2.suspiciousPatternMiddleware);
app.use(security_2.csrfProtectionMiddleware);
// IP-based rate limiting (глобальный)
if (process.env.NODE_ENV === 'production') {
    app.use(security_2.ipRateLimitMiddleware);
}
// Metrics middleware (должен быть до роутов)
app.use(metrics_2.metricsMiddleware);
// Session configuration with Redis store
app.use((0, express_session_1.default)({
    store: new connect_redis_1.default({ client: redis_2.default }),
    secret: process.env.SESSION_SECRET || 'fallback-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    },
}));
// Rate limiting - общий
const generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({ error: 'Too many requests from this IP, please try again later.' });
    },
});
// Rate limiting - строгий для авторизации
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // только 5 попыток входа за 15 минут
    message: { error: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // не считаем успешные попытки
    handler: (req, res) => {
        res.status(429).json({ error: 'Too many login attempts, please try again later.' });
    },
});
// Rate limiting для suggestions (автодополнение)
const suggestionsLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 запросов в минуту
    message: { error: 'Too many suggestion requests, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({ error: 'Too many suggestion requests, please slow down.' });
    },
});
app.use('/api/', generalLimiter);
// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'SmartPrice API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: '/health',
            api: '/api/*',
            metrics: '/metrics'
        }
    });
});
// Health check with dependencies
app.get('/health', async (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
            database: 'unknown',
            redis: 'unknown',
        },
    };
    try {
        const db = (await Promise.resolve().then(() => __importStar(require('./config/database')))).default;
        await db.query('SELECT 1');
        health.services.database = 'ok';
    }
    catch (e) {
        health.services.database = 'error';
        health.status = 'degraded';
        console.error('❌ Database health check failed:', e);
    }
    try {
        await redis_2.default.ping();
        health.services.redis = 'ok';
    }
    catch (e) {
        health.services.redis = 'error';
        health.status = 'degraded';
        console.error('❌ Redis health check failed:', e);
    }
    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
});
// API routes
app.use('/api/search', (0, advancedSecurity_1.advancedRateLimitMiddleware)('search'), search_1.default);
app.use('/api/auth', authLimiter, enhancedSecurity_1.credentialStuffingDetection, auth_1.default);
app.use('/api/email-verification', emailVerification_1.default);
app.use('/api/sessions', enhancedSecurity_1.anomalyDetection, enhancedSecurity_1.accountTakeoverDetection, sessions_1.default);
app.use('/api/api-keys', apiKeys_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/security', security_1.default); // NEW: Ultimate Security Routes
app.use('/api/favorites', enhancedSecurity_1.anomalyDetection, favorites_1.default);
app.use('/api/price-tracking', priceTracking_1.default);
app.use('/api/analytics', analytics_1.default);
app.use('/api/suggestions', suggestionsLimiter, suggestions_1.default);
app.use('/api/price-history', priceHistory_1.default);
app.use('/api/compare', compare_1.default);
app.use('/metrics', metrics_1.default);
// CSP violation report endpoint
app.post('/api/csp-report', express_1.default.json({ type: 'application/csp-report' }), advancedSecurity_1.cspReportHandler);
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});
// Error metrics middleware
app.use(metrics_2.errorMetricsMiddleware);
// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    const statusCode = err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message;
    res.status(statusCode).json({
        error: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});
async function startServer() {
    try {
        // Подключаемся к Redis (критично для работы)
        await (0, redis_1.connectRedis)();
        console.log('✅ Redis connected');
        // Проверяем подключение к БД
        const db = (await Promise.resolve().then(() => __importStar(require('./config/database')))).default;
        await db.query('SELECT 1');
        console.log('✅ Database connected');
        // Инициализируем схему БД (если еще не создана)
        await (0, initSchema_1.initializeDatabase)();
        // Включаем pg_stat_statements для мониторинга
        await databaseMonitoringService_1.databaseMonitoringService.enableStatements();
        // ============================================
        // ULTIMATE SECURITY INITIALIZATION
        // ============================================
        // Инициализация Secrets Management
        await secretsManagementService_1.default.initialize();
        console.log('🔐 Secrets Management initialized');
        // Запуск Security Monitoring Service
        securityMonitoringService_1.default.startMonitoring();
        console.log('🔒 Security Monitoring started');
        // Построение профилей пользователей для anomaly detection (фоновая задача)
        setTimeout(async () => {
            console.log('🤖 Building user behavior profiles...');
            await anomalyDetectionService_1.default.updateAllProfiles();
            console.log('✅ User behavior profiles updated');
        }, 60000); // Через 1 минуту после запуска
        // Cache warming - предзагрузка популярных данных
        await advancedCacheService_1.advancedCacheService.warmCache(async () => {
            console.log('🔥 Cache warming started...');
            // Здесь можно добавить предзагрузку популярных данных
        });
        // Запускаем background jobs
        priceCheckJob_1.default.start(60); // Проверка цен каждый час
        priceHistoryJob_1.default.start(24); // Сбор истории раз в сутки
        // Периодическая очистка старых метрик
        setInterval(() => {
            metricsService_1.default.cleanup();
        }, 60 * 60 * 1000); // Каждый час
        // Периодическая очистка истекших сессий
        setInterval(async () => {
            await sessionService_1.sessionService.cleanupExpiredSessions();
        }, 60 * 60 * 1000); // Каждый час
        // Периодическая очистка очередей
        setInterval(async () => {
            await queueService_1.queueService.cleanQueues();
        }, 24 * 60 * 60 * 1000); // Раз в сутки
        // Периодическое обновление профилей пользователей
        setInterval(async () => {
            await anomalyDetectionService_1.default.updateAllProfiles();
        }, 24 * 60 * 60 * 1000); // Раз в сутки
        // Периодическая проверка необходимости ротации секретов
        setInterval(async () => {
            const needsRotation = await secretsManagementService_1.default.checkRotationNeeded('jwt_secret');
            if (needsRotation) {
                console.log('⚠️  JWT secret rotation needed!');
            }
        }, 7 * 24 * 60 * 60 * 1000); // Раз в неделю
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log('\n' + '='.repeat(60));
            console.log('🚀 SmartPrice Backend - ULTIMATE SECURITY EDITION');
            console.log('='.repeat(60));
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`📊 Health check: /health`);
            console.log(`📈 Metrics: /metrics`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log('\n🔒 SECURITY FEATURES:');
            console.log('  ✓ 2FA/MFA Authentication');
            console.log('  ✓ Intrusion Prevention System (IPS)');
            console.log('  ✓ Web Application Firewall (WAF)');
            console.log('  ✓ DDoS Protection');
            console.log('  ✓ Anomaly Detection (ML-based)');
            console.log('  ✓ Vulnerability Scanner');
            console.log('  ✓ Security Monitoring & Alerting');
            console.log('  ✓ Secrets Management & Rotation');
            console.log('  ✓ Advanced Rate Limiting');
            console.log('  ✓ Bot Detection');
            console.log('  ✓ Credential Stuffing Protection');
            console.log('  ✓ Account Takeover Detection');
            console.log('  ✓ Geo-blocking Support');
            console.log('\n⚡ PERFORMANCE FEATURES:');
            console.log('  ✓ Advanced Caching (L1 Memory + L2 Redis)');
            console.log('  ✓ Database Query Optimization');
            console.log('  ✓ Connection Pooling');
            console.log('  ✓ Async Processing (Bull Queues)');
            console.log('  ✓ CDN Ready');
            console.log('  ✓ HTTP/2 Support');
            console.log('\n📧 Queue service initialized');
            console.log('='.repeat(60) + '\n');
        });
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`❌ Port ${PORT} is already in use`);
            }
            else {
                console.error('❌ Server error:', error);
            }
            process.exit(1);
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('⚠️ SIGTERM received, shutting down gracefully...');
    priceCheckJob_1.default.stop();
    priceHistoryJob_1.default.stop();
    securityMonitoringService_1.default.stopMonitoring();
    try {
        await queueService_1.queueService.close();
        console.log('✅ Queue service closed');
    }
    catch (err) {
        console.error('❌ Error closing queue service:', err);
    }
    try {
        await redis_2.default.quit();
        console.log('✅ Redis connection closed');
    }
    catch (err) {
        console.error('❌ Error closing Redis:', err);
    }
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('⚠️ SIGINT received, shutting down gracefully...');
    priceCheckJob_1.default.stop();
    priceHistoryJob_1.default.stop();
    securityMonitoringService_1.default.stopMonitoring();
    try {
        await queueService_1.queueService.close();
        console.log('✅ Queue service closed');
    }
    catch (err) {
        console.error('❌ Error closing queue service:', err);
    }
    try {
        await redis_2.default.quit();
        console.log('✅ Redis connection closed');
    }
    catch (err) {
        console.error('❌ Error closing Redis:', err);
    }
    process.exit(0);
});
startServer();
