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
const priceCheckJob_1 = __importDefault(require("./services/jobs/priceCheckJob"));
const priceHistoryJob_1 = __importDefault(require("./services/jobs/priceHistoryJob"));
const metrics_2 = require("./middleware/metrics");
const metricsService_1 = __importDefault(require("./services/monitoring/metricsService"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);
// CORS configuration with credentials
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use((0, cookie_parser_1.default)());
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
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
// Rate limiting - строгий для авторизации
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // только 5 попыток входа за 15 минут
    message: 'Too many login attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // не считаем успешные попытки
});
// Rate limiting для suggestions (автодополнение)
const suggestionsLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 запросов в минуту
    message: 'Too many suggestion requests, please slow down.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', generalLimiter);
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
app.use('/api/search', search_1.default);
app.use('/api/auth', authLimiter, auth_1.default);
app.use('/api/favorites', favorites_1.default);
app.use('/api/price-tracking', priceTracking_1.default);
app.use('/api/analytics', analytics_1.default);
app.use('/api/suggestions', suggestionsLimiter, suggestions_1.default);
app.use('/api/price-history', priceHistory_1.default);
app.use('/api/compare', compare_1.default);
app.use('/metrics', metrics_1.default);
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
        // Запускаем background jobs
        priceCheckJob_1.default.start(60); // Проверка цен каждый час
        priceHistoryJob_1.default.start(24); // Сбор истории раз в сутки
        // Периодическая очистка старых метрик
        setInterval(() => {
            metricsService_1.default.cleanup();
        }, 60 * 60 * 1000); // Каждый час
        app.listen(PORT, () => {
            console.log(`✅ Server running on http://localhost:${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
            console.log(`📈 Metrics: http://localhost:${PORT}/metrics`);
            console.log(`📈 Metrics JSON: http://localhost:${PORT}/metrics/json`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
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
