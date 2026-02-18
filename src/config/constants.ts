/**
 * Application Constants
 * Централизованное хранение всех констант приложения
 */

// Authentication
export const AUTH = {
  JWT_EXPIRES_IN: '15m', // Short-lived access token
  REFRESH_TOKEN_EXPIRES_IN: '7d',
  SALT_ROUNDS: 12,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60, // 15 minutes in seconds
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 100,
} as const;

// UI Constants
export const UI = {
  MAX_COMPARE_PRODUCTS: 4,
  MAX_FAVORITES: 1000,
  MAX_PRICE_TRACKING: 100,
} as const;

// Rate Limiting
export const RATE_LIMITS = {
  AUTH: { windowMs: 15 * 60 * 1000, max: 5 },
  SEARCH: { windowMs: 60 * 1000, max: 100 },
  SUGGESTIONS: { windowMs: 60 * 1000, max: 30 },
  API: { windowMs: 60 * 1000, max: 60 },
  AUTHENTICATED: { windowMs: 60 * 1000, max: 200 },
  GLOBAL_IP: { windowMs: 60 * 60 * 1000, max: 1000 },
} as const;

// DDoS Protection (оптимизированные пороги)
export const DDOS = {
  SUSPICIOUS_THRESHOLD: 1000, // запросов в минуту с одного IP
  GLOBAL_THRESHOLD: 50000, // общих запросов в минуту
  WINDOW_SIZE: 60, // seconds
  BLOCK_DURATION: 3600, // 1 hour
} as const;

// Database
export const DATABASE = {
  POOL_MAX: process.env.NODE_ENV === 'production' ? 20 : 10,
  POOL_MIN: process.env.NODE_ENV === 'production' ? 5 : 2,
  IDLE_TIMEOUT: 30000,
  CONNECTION_TIMEOUT: 5000,
  STATEMENT_TIMEOUT: 30000,
  QUERY_TIMEOUT: 30000,
} as const;

// Redis
export const REDIS = {
  RETRY_DELAY: 1000,
  MAX_RETRIES: 3,
  CONNECT_TIMEOUT: 5000,
} as const;

// Cache
export const CACHE = {
  DEFAULT_TTL: 300, // 5 minutes
  SEARCH_TTL: 600, // 10 minutes
  USER_TTL: 1800, // 30 minutes
  POPULAR_QUERIES_TTL: 3600, // 1 hour
  MAX_MEMORY_CACHE_SIZE: 100, // MB
} as const;

// Security
export const SECURITY = {
  SECRETS_ROTATION_INTERVAL_DAYS: 90,
  SESSION_MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days
  CSRF_TOKEN_LENGTH: 32,
  API_KEY_LENGTH: 32,
  ENCRYPTION_ALGORITHM: 'aes-256-gcm' as const,
  MASTER_KEY_LENGTH: 32,
} as const;

// Monitoring
export const MONITORING = {
  METRICS_CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
  SESSION_CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
  QUEUE_CLEANUP_INTERVAL: 24 * 60 * 60 * 1000, // 1 day
  SECURITY_CHECK_INTERVAL: 60 * 1000, // 1 minute
  PROFILE_UPDATE_INTERVAL: 24 * 60 * 60 * 1000, // 1 day
} as const;

// Jobs
export const JOBS = {
  PRICE_CHECK_INTERVAL: 60, // minutes
  PRICE_HISTORY_INTERVAL: 24, // hours
  MAX_RETRIES: 3,
  BACKOFF_DELAY: 5000, // 5 seconds
} as const;

// Email
export const EMAIL = {
  VERIFICATION_CODE_LENGTH: 6,
  VERIFICATION_CODE_EXPIRY: 15 * 60 * 1000, // 15 minutes
  QUEUE_RETRY_ATTEMPTS: 3,
  QUEUE_RETRY_DELAY: 60000, // 1 minute
} as const;

// API
export const API = {
  MAX_REQUEST_SIZE: '10mb',
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  TIMEOUT: 30000, // 30 seconds
} as const;

// Validation
export const VALIDATION = {
  EMAIL_REGEX: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  DISPOSABLE_EMAIL_DOMAINS: [
    'tempmail.com',
    'throwaway.email',
    '10minutemail.com',
    'guerrillamail.com',
    'mailinator.com',
    'maildrop.cc',
    'temp-mail.org',
    'getnada.com',
    'trashmail.com',
    'yopmail.com',
  ],
  COMMON_PASSWORDS: [
    'password',
    'password123',
    '12345678',
    '123456789',
    '1234567890',
    'qwerty',
    'qwerty123',
    'abc123',
    'letmein',
    'welcome',
    'monkey',
    'dragon',
    'master',
    'sunshine',
    'princess',
    'football',
    'iloveyou',
    'admin',
    'root',
    'user',
  ],
  SEQUENTIAL_PATTERNS: [
    '123456',
    '234567',
    '345678',
    '456789',
    'abcdef',
    'qwerty',
    'asdfgh',
    'zxcvbn',
  ],
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Error Codes
export const ERROR_CODES = {
  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  
  // Security
  SQL_INJECTION_DETECTED: 'SQL_INJECTION_DETECTED',
  XSS_DETECTED: 'XSS_DETECTED',
  PATH_TRAVERSAL_DETECTED: 'PATH_TRAVERSAL_DETECTED',
  COMMAND_INJECTION_DETECTED: 'COMMAND_INJECTION_DETECTED',
  ANOMALY_DETECTED: 'ANOMALY_DETECTED',
  BOT_DETECTED: 'BOT_DETECTED',
  HIGH_THREAT_SCORE: 'HIGH_THREAT_SCORE',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Validation
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // General
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export default {
  AUTH,
  RATE_LIMITS,
  DDOS,
  DATABASE,
  REDIS,
  CACHE,
  SECURITY,
  MONITORING,
  JOBS,
  EMAIL,
  API,
  VALIDATION,
  HTTP_STATUS,
  ERROR_CODES,
};
