import { createClient } from 'redis';
import { GracefulDegradation } from '../utils/gracefulDegradation';
import { REDIS } from './constants';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > REDIS.MAX_RETRIES) {
        const logger = require('../utils/logger').default;
        logger.error('❌ Redis max retries reached, using fallback');
        GracefulDegradation.setRedisStatus(false);
        return new Error('Redis max retries reached');
      }
      return Math.min(retries * REDIS.RETRY_DELAY, 10000);
    },
    connectTimeout: REDIS.CONNECT_TIMEOUT,
  },
});

redisClient.on('error', (err) => {
  const logger = require('../utils/logger').default;
  logger.error('❌ Redis error:', err);
  GracefulDegradation.setRedisStatus(false);
});

redisClient.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    const logger = require('../utils/logger').default;
    logger.info('✅ Redis connected');
  }
  GracefulDegradation.setRedisStatus(true);
});

redisClient.on('ready', () => {
  GracefulDegradation.setRedisStatus(true);
});

redisClient.on('end', () => {
  const logger = require('../utils/logger').default;
  logger.warn('⚠️  Redis connection closed');
  GracefulDegradation.setRedisStatus(false);
});

export async function connectRedis() {
  const logger = require('../utils/logger').default;
  try {
    await redisClient.connect();
    GracefulDegradation.setRedisStatus(true);
  } catch (error) {
    logger.error('❌ Failed to connect to Redis:', error);
    GracefulDegradation.setRedisStatus(false);
  }
}

export { redisClient };
export default redisClient;
