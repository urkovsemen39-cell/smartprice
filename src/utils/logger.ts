/**
 * Winston Logger Configuration
 * Централизованное логирование с уровнями и форматированием
 */

import winston from 'winston';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';

// Форматирование логов
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Транспорты
const transports: winston.transport[] = [
  // Console transport (всегда используется)
  new winston.transports.Console({
    format: consoleFormat,
    level: isProduction ? 'info' : 'debug',
  }),
];

// В production добавляем файловые транспорты только если есть доступ к файловой системе
// Railway и другие облачные платформы используют только консоль
if (isProduction && process.env.ENABLE_FILE_LOGGING === 'true') {
  try {
    const fs = require('fs');
    const logsDir = path.join(process.cwd(), 'logs');
    
    // Проверяем возможность создания директории
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    transports.push(
      // Все логи
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: logFormat,
        maxsize: 10485760, // 10MB
        maxFiles: 5,
      }),
      // Только ошибки
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: logFormat,
        maxsize: 10485760, // 10MB
        maxFiles: 5,
      })
    );
  } catch (error) {
    // Если не удалось создать файловые транспорты, используем только консоль
    console.warn('File logging disabled: unable to create logs directory');
  }
}

// Создание logger
const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: logFormat,
  transports,
  exitOnError: false,
});

// Обработка необработанных исключений (только консоль в облаке)
if (isProduction) {
  logger.exceptions.handle(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );

  logger.rejections.handle(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// Вспомогательные функции для структурированного логирования
export const logSecurity = (message: string, meta?: Record<string, unknown>) => {
  logger.warn(`[SECURITY] ${message}`, meta);
};

export const logAudit = (message: string, meta?: Record<string, unknown>) => {
  logger.info(`[AUDIT] ${message}`, meta);
};

export const logPerformance = (message: string, meta?: Record<string, unknown>) => {
  logger.debug(`[PERFORMANCE] ${message}`, meta);
};

export const logDatabase = (message: string, meta?: Record<string, unknown>) => {
  logger.debug(`[DATABASE] ${message}`, meta);
};

export const logAPI = (message: string, meta?: Record<string, unknown>) => {
  logger.info(`[API] ${message}`, meta);
};

export default logger;
