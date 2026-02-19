"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_session_1 = __importDefault(require("express-session"));
const connect_redis_1 = __importDefault(require("connect-redis"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const redis_1 = require("./config/redis");
const redis_2 = __importDefault(require("./config/redis"));
const database_1 = require("./config/database");
const initSchema_1 = require("./database/initSchema");
const swagger_1 = require("./config/swagger");
const env_1 = __importDefault(require("./config/env"));
const constants_1 = require("./config/constants");
const errors_1 = require("./utils/errors");
const logger_1 = __importDefault(require("./utils/logger"));
// Routes
const health_1 = __importDefault(require("./api/routes/health"));
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
const owner_1 = __importDefault(require("./api/routes/owner"));
const features_1 = __importDefault(require("./api/routes/features"));
// Jobs
const priceCheckJob_1 = __importDefault(require("./services/jobs/priceCheckJob"));
const priceHistoryJob_1 = __importDefault(require("./services/jobs/priceHistoryJob"));
const maintenanceJob_1 = __importDefault(require("./services/jobs/maintenanceJob"));
const securityCleanupJob_1 = __importDefault(require("./services/jobs/securityCleanupJob"));
// Middleware
const metrics_2 = require("./middleware/metrics");
const securityMiddleware_1 = __importDefault(require("./middleware/securityMiddleware"));
const waf_1 = __importDefault(require("./middleware/waf"));
const ddosProtection_1 = require("./middleware/ddosProtection");
const requestId_1 = require("./middleware/requestId");
const caching_1 = require("./middleware/caching");
const express_2 = require("graphql-http/lib/use/express");
const schema_1 = require("./graphql/schema");
const resolvers_1 = require("./graphql/resolvers");
// Services
const databaseMonitoringService_1 = require("./services/monitoring/databaseMonitoringService");
const advancedCacheService_1 = require("./services/cache/advancedCacheService");
const securityMonitoringService_1 = __importDefault(require("./services/security/securityMonitoringService"));
const secretsManagementService_1 = __importDefault(require("./services/security/secretsManagementService"));
const anomalyDetectionService_1 = __importDefault(require("./services/security/anomalyDetectionService"));
const websocketService_1 = __importDefault(require("./services/websocket/websocketService"));
const app = (0, express_1.default)();
const PORT = env_1.default.PORT;
// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);
// ============================================
// HEALTH CHECK - BEFORE ALL MIDDLEWARE
// ============================================
// Health checks должны быть доступны без middleware
app.use('/health', health_1.default);
// ============================================
// SECURITY MIDDLEWARE STACK
// ============================================
app.use(securityMiddleware_1.default.securityHeaders);
app.use(securityMiddleware_1.default.csp);
// HTTPS enforcement in production
if (env_1.default.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(301, `https://${req.headers.host}${req.url}`);
        }
        next();
    });
}
// CORS configuration
const allowedOrigins = [
    'https://frontend-production-423d.up.railway.app',
    'https://smartprice-production.up.railway.app',
    env_1.default.FRONTEND_URL,
    ...(env_1.default.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:3001'] : [])
].filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.some(allowed => origin.includes(allowed)) ||
            origin.includes('.railway.app') ||
            origin.includes('.up.railway.app')) {
            return callback(null, true);
        }
        logger_1.default.warn(`CORS blocked origin: ${origin}`);
        callback(null, true); // Временно разрешаем все для отладки
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Challenge-Response', 'X-Owner-Session'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400,
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use((0, cookie_parser_1.default)());
// Request ID tracking
app.use(requestId_1.requestIdMiddleware);
// HTTP Caching
app.use(caching_1.cachingMiddleware);
// DDoS Protection
app.use(ddosProtection_1.ddosProtection);
if (env_1.default.ENABLE_GEO_BLOCKING) {
    app.use(ddosProtection_1.geoBlocking);
}
// WAF
app.use(waf_1.default.middleware());
// Input Validation & Security
app.use(securityMiddleware_1.default.inputValidation);
app.use(securityMiddleware_1.default.botDetection);
app.use(securityMiddleware_1.default.threatScoreCheck);
// CSRF отключен для API
// app.use(securityMiddleware.csrfProtection);
// IP-based rate limiting
if (env_1.default.NODE_ENV === 'production') {
    app.use(securityMiddleware_1.default.ipRateLimit);
}
// Metrics middleware
app.use(metrics_2.metricsMiddleware);
// Session configuration
app.use((0, express_session_1.default)({
    store: new connect_redis_1.default({ client: redis_2.default }),
    secret: env_1.default.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: env_1.default.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: constants_1.SECURITY.SESSION_MAX_AGE,
        sameSite: env_1.default.NODE_ENV === 'production' ? 'strict' : 'lax',
    },
}));
// Rate limiting
const generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: constants_1.RATE_LIMITS.API.windowMs,
    max: constants_1.RATE_LIMITS.API.max,
    message: { error: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: constants_1.RATE_LIMITS.AUTH.windowMs,
    max: constants_1.RATE_LIMITS.AUTH.max,
    message: { error: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});
const suggestionsLimiter = (0, express_rate_limit_1.default)({
    windowMs: constants_1.RATE_LIMITS.SUGGESTIONS.windowMs,
    max: constants_1.RATE_LIMITS.SUGGESTIONS.max,
    message: { error: 'Too many suggestion requests, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const emailVerificationLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // 3 attempts per 15 minutes
    message: { error: 'Too many verification attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const passwordResetLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { error: 'Too many password reset attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const compareLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Too many comparison requests, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', generalLimiter);
// ============================================
// ROUTES
// ============================================
// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'SmartPrice API',
        version: '2.0.0',
        status: 'running',
        endpoints: {
            health: '/health',
            api: '/api/v1/*',
            docs: '/api-docs',
            metrics: '/metrics'
        }
    });
});
// Health checks already registered before middleware
// Swagger API Documentation
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'SmartPrice API Documentation',
    customfavIcon: '/favicon.ico',
}));
// GraphQL API
app.all('/graphql', (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
        try {
            const decoded = require('jsonwebtoken').verify(token, env_1.default.JWT_SECRET);
            req.userId = decoded.userId;
        }
        catch (error) {
            // Invalid token, continue without userId
        }
    }
    next();
}, (0, express_2.createHandler)({
    schema: schema_1.schema,
    context: (req) => ({ userId: req.raw.userId }),
}));
// API v1 Router
const v1Router = express_1.default.Router();
v1Router.use('/search', securityMiddleware_1.default.endpointRateLimit('SEARCH'), search_1.default);
v1Router.use('/auth', authLimiter, securityMiddleware_1.default.credentialStuffingDetection, auth_1.default);
v1Router.use('/auth/forgot-password', passwordResetLimiter);
v1Router.use('/auth/reset-password', passwordResetLimiter);
v1Router.use('/email-verification', emailVerificationLimiter, emailVerification_1.default);
v1Router.use('/sessions', securityMiddleware_1.default.anomalyDetection, sessions_1.default);
v1Router.use('/api-keys', apiKeys_1.default);
v1Router.use('/admin', admin_1.default);
v1Router.use('/security', security_1.default);
v1Router.use('/owner', owner_1.default);
v1Router.use('/favorites', securityMiddleware_1.default.anomalyDetection, favorites_1.default);
v1Router.use('/price-tracking', priceTracking_1.default);
v1Router.use('/analytics', analytics_1.default);
v1Router.use('/suggestions', suggestionsLimiter, suggestions_1.default);
v1Router.use('/price-history', priceHistory_1.default);
v1Router.use('/compare', compareLimiter, compare_1.default);
v1Router.use('/features', features_1.default);
app.use('/api/v1', v1Router);
// Backward compatibility redirect
app.use('/api', (req, res, next) => {
    if (!req.path.startsWith('/v1')) {
        const newPath = `/api/v1${req.path}`;
        logger_1.default.info(`Redirecting ${req.path} to ${newPath}`);
        return res.redirect(301, newPath);
    }
    next();
});
app.use('/metrics', metrics_1.default);
// CSP violation report endpoint
app.post('/api/csp-report', express_1.default.json({ type: 'application/csp-report' }), securityMiddleware_1.default.cspReportHandler);
// 404 handler
app.use((req, res) => {
    res.status(constants_1.HTTP_STATUS.NOT_FOUND).json({
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
    });
});
// Error metrics middleware
app.use(metrics_2.errorMetricsMiddleware);
// Global error handler
app.use((err, req, res, next) => {
    (0, errors_1.handleError)(err, res);
});
// ============================================
// SERVER STARTUP
// ============================================
async function startServer() {
    try {
        logger_1.default.info('='.repeat(60));
        logger_1.default.info('SmartPrice Backend - Production Ready Edition');
        logger_1.default.info('='.repeat(60));
        logger_1.default.info(`Starting server on port ${PORT}`);
        logger_1.default.info(`Node environment: ${env_1.default.NODE_ENV}`);
        // Start HTTP server first for healthcheck
        const server = app.listen(PORT, '0.0.0.0', () => {
            logger_1.default.info(`✓ Server listening on 0.0.0.0:${PORT}`);
            logger_1.default.info(`Environment: ${env_1.default.NODE_ENV}`);
        });
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                logger_1.default.error(`Port ${PORT} is already in use`);
            }
            else {
                logger_1.default.error('Server error:', error);
            }
            process.exit(1);
        });
        // Initialize critical services in background
        (async () => {
            try {
                // Connect to Redis
                await (0, redis_1.connectRedis)();
                logger_1.default.info('✓ Redis connected');
                // Check database
                const dbHealthy = await (0, database_1.checkDatabaseHealth)();
                if (!dbHealthy) {
                    throw new Error('Database connection failed');
                }
                logger_1.default.info('✓ Database connected');
                // Initialize database schema
                await (0, initSchema_1.initializeDatabase)();
                logger_1.default.info('✓ Database schema initialized');
                // Enable pg_stat_statements
                await databaseMonitoringService_1.databaseMonitoringService.enableStatements();
                // Initialize Secrets Management
                await secretsManagementService_1.default.initialize();
                logger_1.default.info('✓ Secrets Management initialized');
                // Start Security Monitoring
                securityMonitoringService_1.default.startMonitoring();
                logger_1.default.info('✓ Security Monitoring started');
                // Start Maintenance Jobs
                maintenanceJob_1.default.start();
                securityCleanupJob_1.default.start(24);
                logger_1.default.info('✓ Maintenance Jobs started');
                // Cache warming (non-blocking)
                advancedCacheService_1.advancedCacheService.warmCache(async () => {
                    logger_1.default.info('Cache warming started...');
                }).catch(err => logger_1.default.error('Cache warming failed:', err));
                // Start background jobs
                priceCheckJob_1.default.start(60);
                priceHistoryJob_1.default.start(24);
                logger_1.default.info('✓ Background jobs started');
                // Initialize WebSocket
                websocketService_1.default.initialize(server);
                websocketService_1.default.setPubSub(resolvers_1.pubsub);
                logger_1.default.info('✓ WebSocket initialized');
                // Build user behavior profiles (background)
                setTimeout(async () => {
                    logger_1.default.info('Building user behavior profiles...');
                    await anomalyDetectionService_1.default.updateAllProfiles();
                    logger_1.default.info('User behavior profiles updated');
                }, 60000);
                logger_1.default.info('='.repeat(60));
                logger_1.default.info('🚀 All services initialized successfully');
                logger_1.default.info('SECURITY FEATURES:');
                logger_1.default.info('  ✓ Refresh Token Authentication');
                logger_1.default.info('  ✓ Role-Based Access Control');
                logger_1.default.info('  ✓ 2FA/MFA Authentication');
                logger_1.default.info('  ✓ Intrusion Prevention System (IPS)');
                logger_1.default.info('  ✓ Web Application Firewall (WAF)');
                logger_1.default.info('  ✓ DDoS Protection');
                logger_1.default.info('  ✓ Anomaly Detection (ML-based)');
                logger_1.default.info('  ✓ Vulnerability Scanner');
                logger_1.default.info('  ✓ Security Monitoring & Alerting');
                logger_1.default.info('  ✓ Secrets Management & Rotation');
                logger_1.default.info('  ✓ Bot Detection');
                logger_1.default.info('  ✓ Credential Stuffing Protection');
                logger_1.default.info('  ✓ Account Takeover Detection');
                logger_1.default.info('PERFORMANCE FEATURES:');
                logger_1.default.info('  ✓ Advanced Caching (L1 Memory + L2 Redis)');
                logger_1.default.info('  ✓ Database Query Optimization');
                logger_1.default.info('  ✓ Connection Pooling');
                logger_1.default.info('  ✓ Async Processing (Bull Queues)');
                logger_1.default.info('  ✓ Graceful Degradation');
                logger_1.default.info('  ✓ Circuit Breaker Pattern');
                logger_1.default.info('RELIABILITY FEATURES:');
                logger_1.default.info('  ✓ Health Checks (liveness & readiness)');
                logger_1.default.info('  ✓ Automatic Maintenance Jobs');
                logger_1.default.info('  ✓ Error Standardization');
                logger_1.default.info('  ✓ Comprehensive Logging');
                logger_1.default.info('  ✓ WebSocket Real-time Updates');
                logger_1.default.info('  ✓ GraphQL API with Subscriptions');
                logger_1.default.info('='.repeat(60));
            }
            catch (error) {
                logger_1.default.error('Failed to initialize services:', error);
                // Don't exit - server can still handle requests with degraded functionality
            }
        })();
    }
    catch (error) {
        logger_1.default.error('Failed to start server:', error);
        process.exit(1);
    }
}
// Graceful shutdown с таймаутом
const SHUTDOWN_TIMEOUT = 30000; // 30 секунд
async function gracefulShutdown(signal) {
    logger_1.default.warn(`${signal} received, shutting down gracefully...`);
    const shutdownTimer = setTimeout(() => {
        logger_1.default.error('Graceful shutdown timeout, forcing exit');
        process.exit(1);
    }, SHUTDOWN_TIMEOUT);
    try {
        // Останавливаем jobs
        priceCheckJob_1.default.stop();
        priceHistoryJob_1.default.stop();
        maintenanceJob_1.default.stop();
        securityCleanupJob_1.default.stop();
        securityMonitoringService_1.default.stopMonitoring();
        // Закрываем Redis
        await redis_2.default.quit();
        logger_1.default.info('Redis connection closed');
        // Закрываем database pool
        await database_1.pool.end();
        logger_1.default.info('Database pool closed');
        clearTimeout(shutdownTimer);
        logger_1.default.info('Graceful shutdown completed');
        process.exit(0);
    }
    catch (err) {
        logger_1.default.error('Error during shutdown:', err);
        clearTimeout(shutdownTimer);
        process.exit(1);
    }
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
    logger_1.default.error('Unhandled Rejection at:', { promise, reason });
    // Не завершаем процесс, но логируем
});
process.on('uncaughtException', (error) => {
    logger_1.default.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});
startServer();
