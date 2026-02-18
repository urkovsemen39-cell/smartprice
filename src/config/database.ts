import { Pool } from 'pg';
import { GracefulDegradation } from '../utils/gracefulDegradation';
import { DATABASE } from './constants';

const isProduction = process.env.NODE_ENV === 'production';

const poolConfig = {
  max: DATABASE.POOL_MAX,
  min: DATABASE.POOL_MIN,
  idleTimeoutMillis: DATABASE.IDLE_TIMEOUT,
  connectionTimeoutMillis: DATABASE.CONNECTION_TIMEOUT,
  statement_timeout: DATABASE.STATEMENT_TIMEOUT,
  query_timeout: DATABASE.QUERY_TIMEOUT,
  
  ...(isProduction && {
    ssl: { rejectUnauthorized: false },
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  }),
};

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ...poolConfig,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'smartprice',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      ...poolConfig,
    });

pool.on('error', (err, client) => {
  const logger = require('../utils/logger').default;
  logger.error('Unexpected database pool error:', err);
  GracefulDegradation.setDBStatus(false);
  
  if (isProduction) {
    // Alert будет отправлен через alertService при критичных проблемах
    logger.error('Database connection lost in production');
  }
});

pool.on('connect', (client) => {
  GracefulDegradation.setDBStatus(true);
  if (!isProduction) {
    const logger = require('../utils/logger').default;
    logger.info('New database connection established');
  }
});

pool.on('acquire', (client) => {
  if (!isProduction) {
    const logger = require('../utils/logger').default;
    logger.debug('Database connection acquired from pool');
  }
});

pool.on('remove', (client) => {
  if (!isProduction) {
    const logger = require('../utils/logger').default;
    logger.debug('Database connection removed from pool');
  }
});

// Health check function
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    GracefulDegradation.setDBStatus(true);
    return true;
  } catch (error) {
    const logger = require('../utils/logger').default;
    logger.error('Database health check failed:', error);
    GracefulDegradation.setDBStatus(false);
    return false;
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  const logger = require('../utils/logger').default;
  logger.warn('SIGTERM received, closing database pool...');
  await pool.end();
  logger.info('Database pool closed');
});

export { pool };
export default pool;
