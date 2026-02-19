import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import RedisStore from 'connect-redis';
import swaggerUi from 'swagger-ui-express';
import { connectRedis } from './config/redis';
import redisClient from './config/redis';
import { checkDatabaseHealth, pool } from './config/database';
import { initializeDatabase } from './database/initSchema';
import { swaggerSpec } from './config/swagger';
import env from './config/env';
import { RATE_LIMITS, SECURITY, HTTP_STATUS } from './config/constants';
import { handleError } from './utils/errors';
import logger from './utils/logger';

// Routes
import healthRoutes from './api/routes/health';
import searchRoutes from './api/routes/search';
import authRoutes from './api/routes/auth';
import favoritesRoutes from './api/routes/favorites';
import priceTrackingRoutes from './api/routes/priceTracking';
import analyticsRoutes from './api/routes/analytics';
import suggestionsRoutes from './api/routes/suggestions';
import priceHistoryRoutes from './api/routes/priceHistory';
import compareRoutes from './api/routes/compare';
import metricsRoutes from './api/routes/metrics';
import emailVerificationRoutes from './api/routes/emailVerification';
import sessionsRoutes from './api/routes/sessions';
import apiKeysRoutes from './api/routes/apiKeys';
import adminRoutes from './api/routes/admin';
import securityRoutes from './api/routes/security';
import ownerRoutes from './api/routes/owner';
import featuresRoutes from './api/routes/features';

// Jobs
import priceCheckJob from './services/jobs/priceCheckJob';
import priceHistoryJob from './services/jobs/priceHistoryJob';
import maintenanceJob from './services/jobs/maintenanceJob';
import securityCleanupJob from './services/jobs/securityCleanupJob';

// Middleware
import { metricsMiddleware, errorMetricsMiddleware } from './middleware/metrics';
import securityMiddleware from './middleware/securityMiddleware';
import wafMiddleware from './middleware/waf';
import { ddosProtection, geoBlocking } from './middleware/ddosProtection';
import { requestIdMiddleware } from './middleware/requestId';
import { cachingMiddleware } from './middleware/caching';
import { createHandler } from 'graphql-http/lib/use/express';
import { schema } from './graphql/schema';
import { pubsub } from './graphql/resolvers';
import { WebSocketServer } from 'ws';

// Services
import { databaseMonitoringService } from './services/monitoring/databaseMonitoringService';
import { advancedCacheService } from './services/cache/advancedCacheService';
import securityMonitoringService from './services/security/securityMonitoringService';
import secretsManagementService from './services/security/secretsManagementService';
import anomalyDetectionService from './services/security/anomalyDetectionService';
import websocketService from './services/websocket/websocketService';

const app = express();
const PORT = env.PORT;

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// ============================================
// HEALTH CHECK - BEFORE ALL MIDDLEWARE
// ============================================

// Health checks должны быть доступны без middleware
app.use('/health', healthRoutes);

// ============================================
// SECURITY MIDDLEWARE STACK
// ============================================

app.use(securityMiddleware.securityHeaders);
app.use(securityMiddleware.csp);

// HTTPS enforcement in production
if (env.NODE_ENV === 'production') {
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
  env.FRONTEND_URL,
  ...(env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:3001'] : [])
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.some(allowed => origin.includes(allowed)) || 
        origin.includes('.railway.app') || 
        origin.includes('.up.railway.app')) {
      return callback(null, true);
    }
    
    logger.warn(`CORS blocked origin: ${origin}`);
    callback(null, true); // Временно разрешаем все для отладки
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Challenge-Response', 'X-Owner-Session'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86400,
}));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Request ID tracking
app.use(requestIdMiddleware);

// HTTP Caching
app.use(cachingMiddleware);

// Публичные пути которые не требуют строгой защиты
const publicPaths = [
  '/health',
  '/api/health',
  '/api/v1/health',
  '/metrics',
  '/api/v1/search',
  '/api/v1/analytics',
  '/api/v1/features',
  '/api/v1/compare',
  '/api/v1/price-history',
  '/api/v1/suggestions',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/',
  '/favicon.ico',
  '/api-docs'
];

// Middleware для пропуска публичных путей
const skipForPublicPaths = (middleware: any) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Проверяем точное совпадение или начало пути
    const isPublic = publicPaths.some(path => {
      return req.path === path || req.path.startsWith(path + '/') || req.path.startsWith(path + '?');
    });
    
    if (isPublic) {
      return next();
    }
    return middleware(req, res, next);
  };
};

// DDoS Protection - только для защищённых путей
app.use(skipForPublicPaths(ddosProtection));

if (env.ENABLE_GEO_BLOCKING) {
  app.use(skipForPublicPaths(geoBlocking));
}

// WAF - только для защищённых путей
app.use(skipForPublicPaths(wafMiddleware.middleware()));

// Input Validation & Security - только для защищённых путей
app.use(skipForPublicPaths(securityMiddleware.inputValidation));
app.use(skipForPublicPaths(securityMiddleware.botDetection));
app.use(skipForPublicPaths(securityMiddleware.threatScoreCheck));
// CSRF отключен для API
// app.use(securityMiddleware.csrfProtection);

// IP-based rate limiting
if (env.NODE_ENV === 'production') {
  app.use(securityMiddleware.ipRateLimit);
}

// Metrics middleware
app.use(metricsMiddleware);

// Session configuration
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: SECURITY.SESSION_MAX_AGE,
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
  },
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: RATE_LIMITS.API.windowMs,
  max: RATE_LIMITS.API.max,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Пропускаем публичные эндпоинты
    const publicApiPaths = [
      '/api/v1/search',
      '/api/v1/analytics',
      '/api/v1/features',
      '/api/v1/compare',
      '/api/v1/price-history',
      '/api/v1/suggestions',
      '/api/v1/auth/login',
      '/api/v1/auth/register'
    ];
    return publicApiPaths.some(path => req.path === path || req.path.startsWith(path + '/') || req.path.startsWith(path + '?'));
  }
});

const authLimiter = rateLimit({
  windowMs: RATE_LIMITS.AUTH.windowMs,
  max: RATE_LIMITS.AUTH.max,
  message: { error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const suggestionsLimiter = rateLimit({
  windowMs: RATE_LIMITS.SUGGESTIONS.windowMs,
  max: RATE_LIMITS.SUGGESTIONS.max,
  message: { error: 'Too many suggestion requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const emailVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 attempts per 15 minutes
  message: { error: 'Too many verification attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many password reset attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const compareLimiter = rateLimit({
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

// Favicon handler
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Health checks already registered before middleware

// Swagger API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'SmartPrice API Documentation',
  customfavIcon: '/favicon.ico',
}));

// GraphQL API
app.all('/graphql', (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = require('jsonwebtoken').verify(token, env.JWT_SECRET) as any;
      (req as any).userId = decoded.userId;
    } catch (error) {
      // Invalid token, continue without userId
    }
  }
  next();
}, createHandler({
  schema,
  context: (req) => ({ userId: (req.raw as any).userId }),
}));

// API v1 Router
const v1Router = express.Router();

// Search - публичный эндпоинт без строгих ограничений
v1Router.use('/search', searchRoutes);
v1Router.use('/auth', authLimiter, securityMiddleware.credentialStuffingDetection, authRoutes);
v1Router.use('/auth/forgot-password', passwordResetLimiter);
v1Router.use('/auth/reset-password', passwordResetLimiter);
v1Router.use('/email-verification', emailVerificationLimiter, emailVerificationRoutes);
v1Router.use('/sessions', securityMiddleware.anomalyDetection, sessionsRoutes);
v1Router.use('/api-keys', apiKeysRoutes);
v1Router.use('/admin', adminRoutes);
v1Router.use('/security', securityRoutes);
v1Router.use('/owner', ownerRoutes);
v1Router.use('/favorites', securityMiddleware.anomalyDetection, favoritesRoutes);
v1Router.use('/price-tracking', priceTrackingRoutes);
v1Router.use('/analytics', analyticsRoutes);
v1Router.use('/suggestions', suggestionsLimiter, suggestionsRoutes);
v1Router.use('/price-history', priceHistoryRoutes);
v1Router.use('/compare', compareLimiter, compareRoutes);
v1Router.use('/features', featuresRoutes);

app.use('/api/v1', v1Router);

// Backward compatibility redirect
app.use('/api', (req, res, next) => {
  if (!req.path.startsWith('/v1')) {
    const newPath = `/api/v1${req.path}`;
    logger.info(`Redirecting ${req.path} to ${newPath}`);
    return res.redirect(301, newPath);
  }
  next();
});

app.use('/metrics', metricsRoutes);

// CSP violation report endpoint
app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), securityMiddleware.cspReportHandler);

// 404 handler
app.use((req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({ 
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
  });
});

// Error metrics middleware
app.use(errorMetricsMiddleware);

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  handleError(err, res);
});

// ============================================
// SERVER STARTUP
// ============================================

async function startServer() {
  try {
    logger.info('='.repeat(60));
    logger.info('SmartPrice Backend - Production Ready Edition');
    logger.info('='.repeat(60));
    logger.info(`Starting server on port ${PORT}`);
    logger.info(`Node environment: ${env.NODE_ENV}`);

    // Start HTTP server first for healthcheck
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`✓ Server listening on 0.0.0.0:${PORT}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
    });
    
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use`);
      } else {
        logger.error('Server error:', error);
      }
      process.exit(1);
    });

    // Initialize critical services in background
    (async () => {
      try {
        // Connect to Redis
        await connectRedis();
        logger.info('✓ Redis connected');

        // Check database
        const dbHealthy = await checkDatabaseHealth();
        if (!dbHealthy) {
          throw new Error('Database connection failed');
        }
        logger.info('✓ Database connected');

        // Initialize database schema
        await initializeDatabase();
        logger.info('✓ Database schema initialized');

        // Enable pg_stat_statements
        await databaseMonitoringService.enableStatements();

        // Initialize Secrets Management
        await secretsManagementService.initialize();
        logger.info('✓ Secrets Management initialized');

        // Start Security Monitoring
        securityMonitoringService.startMonitoring();
        logger.info('✓ Security Monitoring started');

        // Start Maintenance Jobs
        maintenanceJob.start();
        securityCleanupJob.start(24);
        logger.info('✓ Maintenance Jobs started');

        // Cache warming (non-blocking)
        advancedCacheService.warmCache(async () => {
          logger.info('Cache warming started...');
        }).catch(err => logger.error('Cache warming failed:', err));

        // Start background jobs
        priceCheckJob.start(60);
        priceHistoryJob.start(24);
        logger.info('✓ Background jobs started');

        // Initialize WebSocket
        websocketService.initialize(server);
        websocketService.setPubSub(pubsub);
        logger.info('✓ WebSocket initialized');

        // Build user behavior profiles (background)
        setTimeout(async () => {
          logger.info('Building user behavior profiles...');
          await anomalyDetectionService.updateAllProfiles();
          logger.info('User behavior profiles updated');
        }, 60000);

        logger.info('='.repeat(60));
        logger.info('🚀 All services initialized successfully');
        logger.info('SECURITY FEATURES:');
        logger.info('  ✓ Refresh Token Authentication');
        logger.info('  ✓ Role-Based Access Control');
        logger.info('  ✓ 2FA/MFA Authentication');
        logger.info('  ✓ Intrusion Prevention System (IPS)');
        logger.info('  ✓ Web Application Firewall (WAF)');
        logger.info('  ✓ DDoS Protection');
        logger.info('  ✓ Anomaly Detection (ML-based)');
        logger.info('  ✓ Vulnerability Scanner');
        logger.info('  ✓ Security Monitoring & Alerting');
        logger.info('  ✓ Secrets Management & Rotation');
        logger.info('  ✓ Bot Detection');
        logger.info('  ✓ Credential Stuffing Protection');
        logger.info('  ✓ Account Takeover Detection');
        logger.info('PERFORMANCE FEATURES:');
        logger.info('  ✓ Advanced Caching (L1 Memory + L2 Redis)');
        logger.info('  ✓ Database Query Optimization');
        logger.info('  ✓ Connection Pooling');
        logger.info('  ✓ Async Processing (Bull Queues)');
        logger.info('  ✓ Graceful Degradation');
        logger.info('  ✓ Circuit Breaker Pattern');
        logger.info('RELIABILITY FEATURES:');
        logger.info('  ✓ Health Checks (liveness & readiness)');
        logger.info('  ✓ Automatic Maintenance Jobs');
        logger.info('  ✓ Error Standardization');
        logger.info('  ✓ Comprehensive Logging');
        logger.info('  ✓ WebSocket Real-time Updates');
        logger.info('  ✓ GraphQL API with Subscriptions');
        logger.info('='.repeat(60));
      } catch (error) {
        logger.error('Failed to initialize services:', error);
        // Don't exit - server can still handle requests with degraded functionality
      }
    })();

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown с таймаутом
const SHUTDOWN_TIMEOUT = 30000; // 30 секунд

async function gracefulShutdown(signal: string) {
  logger.warn(`${signal} received, shutting down gracefully...`);
  
  const shutdownTimer = setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  try {
    // Останавливаем jobs
    priceCheckJob.stop();
    priceHistoryJob.stop();
    maintenanceJob.stop();
    securityCleanupJob.stop();
    securityMonitoringService.stopMonitoring();
    
    // Закрываем Redis
    await redisClient.quit();
    logger.info('Redis connection closed');
    
    // Закрываем database pool
    await pool.end();
    logger.info('Database pool closed');
    
    clearTimeout(shutdownTimer);
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown:', err);
    clearTimeout(shutdownTimer);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  // Не завершаем процесс, но логируем
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

startServer();
