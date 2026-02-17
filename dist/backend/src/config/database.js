"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'smartprice',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20, // максимум 20 соединений
    min: 5, // минимум 5 соединений всегда открыты
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    statement_timeout: 10000, // 10 секунд максимум на запрос
    query_timeout: 10000,
});
pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
    // In production, you might want to:
    // - Send alerts to monitoring system
    // - Attempt reconnection
    // - Gracefully shutdown if critical
});
pool.on('connect', () => {
    if (process.env.NODE_ENV !== 'production') {
        console.log('✅ Database connected');
    }
});
exports.default = pool;
