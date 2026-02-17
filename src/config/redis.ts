import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

redisClient.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('✅ Redis connected');
  }
});

export async function connectRedis() {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error);
  }
}

export default redisClient;
