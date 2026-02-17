"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectRedis = connectRedis;
const redis_1 = require("redis");
const redisClient = (0, redis_1.createClient)({
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
async function connectRedis() {
    try {
        await redisClient.connect();
    }
    catch (error) {
        console.error('❌ Failed to connect to Redis:', error);
    }
}
exports.default = redisClient;
