"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisClient = void 0;
exports.connectRedis = connectRedis;
const redis_1 = require("redis");
const gracefulDegradation_1 = require("../utils/gracefulDegradation");
const constants_1 = require("./constants");
const redisClient = (0, redis_1.createClient)({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > constants_1.REDIS.MAX_RETRIES) {
                const logger = require('../utils/logger').default;
                logger.error('❌ Redis max retries reached, using fallback');
                gracefulDegradation_1.GracefulDegradation.setRedisStatus(false);
                return new Error('Redis max retries reached');
            }
            return Math.min(retries * constants_1.REDIS.RETRY_DELAY, 10000);
        },
        connectTimeout: constants_1.REDIS.CONNECT_TIMEOUT,
    },
});
exports.redisClient = redisClient;
redisClient.on('error', (err) => {
    const logger = require('../utils/logger').default;
    logger.error('❌ Redis error:', err);
    gracefulDegradation_1.GracefulDegradation.setRedisStatus(false);
});
redisClient.on('connect', () => {
    if (process.env.NODE_ENV !== 'production') {
        const logger = require('../utils/logger').default;
        logger.info('✅ Redis connected');
    }
    gracefulDegradation_1.GracefulDegradation.setRedisStatus(true);
});
redisClient.on('ready', () => {
    gracefulDegradation_1.GracefulDegradation.setRedisStatus(true);
});
redisClient.on('end', () => {
    const logger = require('../utils/logger').default;
    logger.warn('⚠️  Redis connection closed');
    gracefulDegradation_1.GracefulDegradation.setRedisStatus(false);
});
async function connectRedis() {
    const logger = require('../utils/logger').default;
    try {
        await redisClient.connect();
        gracefulDegradation_1.GracefulDegradation.setRedisStatus(true);
    }
    catch (error) {
        logger.error('❌ Failed to connect to Redis:', error);
        gracefulDegradation_1.GracefulDegradation.setRedisStatus(false);
    }
}
exports.default = redisClient;
