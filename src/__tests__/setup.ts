// Настройка тестового окружения

// Увеличиваем таймаут для тестов
jest.setTimeout(10000);

// Генерируем случайные секреты для каждого тестового запуска
import * as nodeCrypto from 'crypto';
const generateTestSecret = () => nodeCrypto.randomBytes(32).toString('hex');

// Мокаем переменные окружения
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = generateTestSecret();
process.env.SESSION_SECRET = generateTestSecret();
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'smartprice_test';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.EMAIL_PROVIDER = 'none';

// Подавляем логи в тестах
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};
