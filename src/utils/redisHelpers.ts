import { redisClient } from '../config/redis';

// Helper функции для совместимости с разными версиями Redis API

export async function setWithExpiry(key: string, value: string, seconds: number): Promise<void> {
  await redisClient.setEx(key, seconds, value);
}

export async function deleteKeys(...keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  return await redisClient.del(keys);
}

export async function flushDatabase(): Promise<void> {
  await redisClient.flushDb();
}

export default {
  setWithExpiry,
  deleteKeys,
  flushDatabase,
};
