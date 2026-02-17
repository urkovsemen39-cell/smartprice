import { Pool } from 'pg';

// Используем DATABASE_URL если доступен (Railway, Heroku, etc.)
// Иначе используем отдельные переменные для локальной разработки
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      min: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      statement_timeout: 10000,
      query_timeout: 10000,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'smartprice',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 20,
      min: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      statement_timeout: 10000,
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

export default pool;
