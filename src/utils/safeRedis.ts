import { redisClient } from '../config/redis';
import logger from './logger';

export async function safeRedisGet(key: string): Promise<string | null> {
  try {
    return await redisClient.get(key);
  } catch (error) {
    logger.warn('Redis unavailable, skipping cache', { key });
    return null;
  }
}

export async function safeRedisSet(key: string, value: string, options?: { EX?: number }): Promise<void> {
  try {
    if (options?.EX) {
      await redisClient.setEx(key, options.EX, value);
    } else {
      await redisClient.set(key, value);
    }
  } catch (error) {
    logger.warn('Redis unavailable, skipping cache write', { key });
  }
}

export async function safeRedisIncr(key: string): Promise<number> {
  try {
    return await redisClient.incr(key);
  } catch (error) {
    logger.warn('Redis unavailable, skipping rate limit', { key });
    return 0;
  }
}

export async function safeRedisDel(key: string): Promise<void> {
  try {
    await redisClient.del(key);
  } catch (error) {
    logger.warn('Redis unavailable, skipping cache delete', { key });
  }
}

export async function safeRedisExpire(key: string, seconds: number): Promise<void> {
  try {
    await redisClient.expire(key, seconds);
  } catch (error) {
    logger.warn('Redis unavailable, skipping expire', { key });
  }
}

export async function safeRedisTtl(key: string): Promise<number> {
  try {
    return await redisClient.ttl(key);
  } catch (error) {
    logger.warn('Redis unavailable, skipping ttl', { key });
    return -1;
  }
}
