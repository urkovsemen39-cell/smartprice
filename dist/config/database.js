"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.checkDatabaseHealth = checkDatabaseHealth;
const pg_1 = require("pg");
const gracefulDegradation_1 = require("../utils/gracefulDegradation");
const constants_1 = require("./constants");
const isProduction = process.env.NODE_ENV === 'production';
const poolConfig = {
    max: constants_1.DATABASE.POOL_MAX,
    min: constants_1.DATABASE.POOL_MIN,
    idleTimeoutMillis: constants_1.DATABASE.IDLE_TIMEOUT,
    connectionTimeoutMillis: constants_1.DATABASE.CONNECTION_TIMEOUT,
    statement_timeout: constants_1.DATABASE.STATEMENT_TIMEOUT,
    query_timeout: constants_1.DATABASE.QUERY_TIMEOUT,
    ...(isProduction && {
        ssl: { rejectUnauthorized: false },
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
    }),
};
const pool = process.env.DATABASE_URL
    ? new pg_1.Pool({
        connectionString: process.env.DATABASE_URL,
        ...poolConfig,
    })
    : new pg_1.Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'smartprice',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        ...poolConfig,
    });
exports.pool = pool;
pool.on('error', (err, client) => {
    const logger = require('../utils/logger').default;
    logger.error('Unexpected database pool error:', err);
    gracefulDegradation_1.GracefulDegradation.setDBStatus(false);
    if (isProduction) {
        // Alert будет отправлен через alertService при критичных проблемах
        logger.error('Database connection lost in production');
    }
});
pool.on('connect', (client) => {
    gracefulDegradation_1.GracefulDegradation.setDBStatus(true);
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
async function checkDatabaseHealth() {
    try {
        await pool.query('SELECT 1');
        gracefulDegradation_1.GracefulDegradation.setDBStatus(true);
        return true;
    }
    catch (error) {
        const logger = require('../utils/logger').default;
        logger.error('Database health check failed:', error);
        gracefulDegradation_1.GracefulDegradation.setDBStatus(false);
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
exports.default = pool;
