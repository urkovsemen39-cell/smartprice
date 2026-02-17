import { Pool } from 'pg';

// Конфигурация пула в зависимости от окружения
const isProduction = process.env.NODE_ENV === 'production';

const poolConfig = {
  // Размер пула
  max: isProduction ? 20 : 10, // Максимум соединений
  min: isProduction ? 5 : 2,   // Минимум соединений
  
  // Таймауты
  idleTimeoutMillis: 30000,        // Закрывать неактивные соединения через 30 сек
  connectionTimeoutMillis: 5000,   // Таймаут подключения 5 сек
  
  // Query таймауты (защита от долгих запросов)
  statement_timeout: 30000,        // 30 сек на выполнение запроса
  query_timeout: 30000,            // 30 сек общий таймаут
  
  // Настройки для production
  ...(isProduction && {
    ssl: { rejectUnauthorized: false },
    // Автоматическое переподключение
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  }),
};

// Используем DATABASE_URL если доступен (Railway, Heroku, etc.)
// Иначе используем отдельные переменные для локальной разработки
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

// Обработка ошибок пула
pool.on('error', (err, client) => {
  console.error('❌ Unexpected database pool error:', err);
  // В production можно добавить отправку алертов
  if (isProduction) {
    // TODO: Отправить алерт в систему мониторинга
  }
});

pool.on('connect', (client) => {
  if (!isProduction) {
    console.log('✅ New database connection established');
  }
});

pool.on('acquire', (client) => {
  if (!isProduction) {
    console.log('🔄 Database connection acquired from pool');
  }
});

pool.on('remove', (client) => {
  if (!isProduction) {
    console.log('🗑️ Database connection removed from pool');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('⚠️ SIGTERM received, closing database pool...');
  await pool.end();
  console.log('✅ Database pool closed');
});

export default pool;
