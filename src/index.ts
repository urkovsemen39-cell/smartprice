import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { connectRedis } from './config/redis';
import redisClient from './config/redis';
import { initializeDatabase } from './database/initSchema';
import searchRoutes from './api/routes/search';
import authRoutes from './api/routes/auth';
import favoritesRoutes from './api/routes/favorites';
import priceTrackingRoutes from './api/routes/priceTracking';
import analyticsRoutes from './api/routes/analytics';
import suggestionsRoutes from './api/routes/suggestions';
import priceHistoryRoutes from './api/routes/priceHistory';
import compareRoutes from './api/routes/compare';
import metricsRoutes from './api/routes/metrics';
import priceCheckJob from './services/jobs/priceCheckJob';
import priceHistoryJob from './services/jobs/priceHistoryJob';
import { metricsMiddleware, errorMetricsMiddleware } from './middleware/metrics';
import metricsService from './services/monitoring/metricsService';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// CORS configuration with credentials
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Metrics middleware (должен быть до роутов)
app.use(metricsMiddleware);

// Session configuration with Redis store
app.use(session({
  store: new RedisStore({ client: redisClient }),
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
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting - строгий для авторизации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // только 5 попыток входа за 15 минут
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // не считаем успешные попытки
});

// Rate limiting для suggestions (автодополнение)
const suggestionsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 запросов в минуту
  message: 'Too many suggestion requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
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
    const db = (await import('./config/database')).default;
    await db.query('SELECT 1');
    health.services.database = 'ok';
  } catch (e) {
    health.services.database = 'error';
    health.status = 'degraded';
    console.error('❌ Database health check failed:', e);
  }

  try {
    await redisClient.ping();
    health.services.redis = 'ok';
  } catch (e) {
    health.services.redis = 'error';
    health.status = 'degraded';
    console.error('❌ Redis health check failed:', e);
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// API routes
app.use('/api/search', searchRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/price-tracking', priceTrackingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/suggestions', suggestionsLimiter, suggestionsRoutes);
app.use('/api/price-history', priceHistoryRoutes);
app.use('/api/compare', compareRoutes);
app.use('/metrics', metricsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error metrics middleware
app.use(errorMetricsMiddleware);

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
    await connectRedis();
    console.log('✅ Redis connected');

    // Проверяем подключение к БД
    const db = (await import('./config/database')).default;
    await db.query('SELECT 1');
    console.log('✅ Database connected');

    // Инициализируем схему БД (если еще не создана)
    await initializeDatabase();

    // Запускаем background jobs
    priceCheckJob.start(60); // Проверка цен каждый час
    priceHistoryJob.start(24); // Сбор истории раз в сутки
    
    // Периодическая очистка старых метрик
    setInterval(() => {
      metricsService.cleanup();
    }, 60 * 60 * 1000); // Каждый час
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`📊 Health check: /health`);
      console.log(`📈 Metrics: /metrics`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
    
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('⚠️ SIGTERM received, shutting down gracefully...');
  
  priceCheckJob.stop();
  priceHistoryJob.stop();
  
  try {
    await redisClient.quit();
    console.log('✅ Redis connection closed');
  } catch (err) {
    console.error('❌ Error closing Redis:', err);
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('⚠️ SIGINT received, shutting down gracefully...');
  
  priceCheckJob.stop();
  priceHistoryJob.stop();
  
  try {
    await redisClient.quit();
    console.log('✅ Redis connection closed');
  } catch (err) {
    console.error('❌ Error closing Redis:', err);
  }
  
  process.exit(0);
});

startServer();
