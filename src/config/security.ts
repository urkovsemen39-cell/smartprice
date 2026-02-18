/**
 * Security Configuration
 * Централизованная конфигурация безопасности
 */

import env from './env';

export const SECURITY_CONFIG = {
  // JWT Configuration
  jwt: {
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    algorithm: 'HS256' as const,
    issuer: 'smartprice-api',
    audience: 'smartprice-client',
  },

  // Password Policy
  password: {
    minLength: 8,
    maxLength: 100,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    minStrength: 3, // из 4 требований
    saltRounds: 12,
  },

  // Account Lockout
  lockout: {
    maxAttempts: 5,
    duration: 15 * 60, // 15 minutes in seconds
    resetOnSuccess: true,
  },

  // Session Configuration
  session: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxConcurrentSessions: 5,
    absoluteTimeout: 30 * 24 * 60 * 60 * 1000, // 30 days
    idleTimeout: 24 * 60 * 60 * 1000, // 24 hours
  },

  // Rate Limiting
  rateLimit: {
    auth: { windowMs: 15 * 60 * 1000, max: 5 },
    api: { windowMs: 60 * 1000, max: 60 },
    search: { windowMs: 60 * 1000, max: 100 },
    authenticated: { windowMs: 60 * 1000, max: 200 },
  },

  // DDoS Protection
  ddos: {
    suspiciousThreshold: 1000, // requests per minute from single IP
    globalThreshold: 50000, // total requests per minute
    windowSize: 60, // seconds
    blockDuration: 3600, // 1 hour
    emergencyMode: {
      threshold: 100000, // requests per minute to trigger
      duration: 300, // 5 minutes
    },
  },

  // CORS Configuration
  cors: {
    allowedOrigins: [
      env.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:3001',
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Challenge-Response'],
  },

  // CSP (Content Security Policy)
  csp: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
    reportUri: '/api/csp-report',
  },

  // Security Headers
  headers: {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  },

  // 2FA Configuration
  twoFactor: {
    issuer: 'SmartPrice',
    window: 2, // Allow 2 time steps before/after
    backupCodesCount: 10,
    enforceForAdmins: true,
    enforceForAll: env.ENABLE_2FA_ENFORCEMENT,
  },

  // Encryption
  encryption: {
    algorithm: 'aes-256-gcm' as const,
    keyLength: 32,
    ivLength: 16,
    tagLength: 16,
  },

  // API Keys
  apiKeys: {
    length: 32,
    prefix: 'sk_',
    maxPerUser: 10,
    defaultExpiry: 365 * 24 * 60 * 60 * 1000, // 1 year
  },

  // Secrets Rotation
  secretsRotation: {
    intervalDays: 90,
    warningDays: 7,
    autoRotate: false, // Manual rotation recommended
  },

  // Monitoring
  monitoring: {
    metricsCleanupInterval: 60 * 60 * 1000, // 1 hour
    sessionCleanupInterval: 60 * 60 * 1000, // 1 hour
    securityCheckInterval: 60 * 1000, // 1 minute
    profileUpdateInterval: 24 * 60 * 60 * 1000, // 1 day
  },

  // Anomaly Detection
  anomalyDetection: {
    enabled: true,
    thresholds: {
      low: 30,
      medium: 50,
      high: 70,
      critical: 90,
    },
    blockOnCritical: true,
    alertOnHigh: true,
  },

  // WAF (Web Application Firewall)
  waf: {
    enabled: true,
    logOnly: false, // Set to true to log without blocking
    blockCritical: true,
    blockHigh: true,
    blockMedium: false,
  },

  // Geo-blocking
  geoBlocking: {
    enabled: env.ENABLE_GEO_BLOCKING,
    blockedCountries: [], // Add country codes to block
    allowedCountries: [], // If set, only these countries are allowed
  },
} as const;

export default SECURITY_CONFIG;
