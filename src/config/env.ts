/**
 * Environment Variables Validation
 * Валидация и типизация переменных окружения при старте приложения
 */

import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  // Server
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  
  // Frontend
  FRONTEND_URL: string;
  
  // Database
  DATABASE_URL?: string;
  DB_HOST?: string;
  DB_PORT?: number;
  DB_NAME?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
  
  // Redis
  REDIS_URL: string;
  
  // Secrets
  JWT_SECRET: string;
  SESSION_SECRET: string;
  MASTER_ENCRYPTION_KEY?: string;
  
  // Email
  EMAIL_PROVIDER: 'none' | 'sendgrid' | 'aws-ses' | 'nodemailer';
  EMAIL_FROM: string;
  EMAIL_FROM_NAME: string;
  SENDGRID_API_KEY?: string;
  AWS_SES_REGION?: string;
  AWS_SES_ACCESS_KEY?: string;
  AWS_SES_SECRET_KEY?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_SECURE?: boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  
  // Security
  ENABLE_GEO_BLOCKING: boolean;
  ENABLE_2FA_ENFORCEMENT: boolean;
  ENABLE_SECURITY_ALERTS: boolean;
  ENABLE_SLACK_ALERTS: boolean;
  ENABLE_TELEGRAM_ALERTS: boolean;
  SLACK_WEBHOOK_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  
  // Marketplace APIs
  YANDEX_MARKET_API_KEY?: string;
  YANDEX_MARKET_CLIENT_ID?: string;
  ALIEXPRESS_APP_KEY?: string;
  ALIEXPRESS_APP_SECRET?: string;
  ADMITAD_CAMPAIGN_ID?: string;
}

class EnvValidator {
  private errors: string[] = [];

  private getString(key: string, required: boolean = false, defaultValue?: string): string {
    const value = process.env[key] || defaultValue;
    
    if (required && !value) {
      this.errors.push(`Missing required environment variable: ${key}`);
      return '';
    }
    
    return value || '';
  }

  private getNumber(key: string, required: boolean = false, defaultValue?: number): number {
    const value = process.env[key];
    
    if (!value) {
      if (required) {
        this.errors.push(`Missing required environment variable: ${key}`);
        return 0;
      }
      return defaultValue || 0;
    }
    
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      this.errors.push(`Invalid number for environment variable: ${key}`);
      return defaultValue || 0;
    }
    
    return parsed;
  }

  private getBoolean(key: string, defaultValue: boolean = false): boolean {
    const value = process.env[key];
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  validate(): EnvConfig {
    const isProduction = process.env.NODE_ENV === 'production';

    const config: EnvConfig = {
      // Server
      PORT: this.getNumber('PORT', false, 3001),
      NODE_ENV: (process.env.NODE_ENV as any) || 'development',
      
      // Frontend
      FRONTEND_URL: this.getString('FRONTEND_URL', false, 'http://localhost:3000'),
      
      // Database
      DATABASE_URL: this.getString('DATABASE_URL'),
      DB_HOST: this.getString('DB_HOST', !process.env.DATABASE_URL, 'localhost'),
      DB_PORT: this.getNumber('DB_PORT', false, 5432),
      DB_NAME: this.getString('DB_NAME', !process.env.DATABASE_URL, 'smartprice'),
      DB_USER: this.getString('DB_USER', !process.env.DATABASE_URL, 'postgres'),
      DB_PASSWORD: this.getString('DB_PASSWORD', !process.env.DATABASE_URL, 'postgres'),
      
      // Redis
      REDIS_URL: this.getString('REDIS_URL', false, 'redis://localhost:6379'),
      
      // Secrets
      JWT_SECRET: this.getString('JWT_SECRET', isProduction),
      SESSION_SECRET: this.getString('SESSION_SECRET', isProduction),
      MASTER_ENCRYPTION_KEY: this.getString('MASTER_ENCRYPTION_KEY'),
      
      // Email
      EMAIL_PROVIDER: (this.getString('EMAIL_PROVIDER', false, 'none') as any),
      EMAIL_FROM: this.getString('EMAIL_FROM', false, 'noreply@smartprice.ru'),
      EMAIL_FROM_NAME: this.getString('EMAIL_FROM_NAME', false, 'SmartPrice'),
      SENDGRID_API_KEY: this.getString('SENDGRID_API_KEY'),
      AWS_SES_REGION: this.getString('AWS_SES_REGION'),
      AWS_SES_ACCESS_KEY: this.getString('AWS_SES_ACCESS_KEY'),
      AWS_SES_SECRET_KEY: this.getString('AWS_SES_SECRET_KEY'),
      SMTP_HOST: this.getString('SMTP_HOST'),
      SMTP_PORT: this.getNumber('SMTP_PORT'),
      SMTP_SECURE: this.getBoolean('SMTP_SECURE'),
      SMTP_USER: this.getString('SMTP_USER'),
      SMTP_PASS: this.getString('SMTP_PASS'),
      
      // Security
      ENABLE_GEO_BLOCKING: this.getBoolean('ENABLE_GEO_BLOCKING'),
      ENABLE_2FA_ENFORCEMENT: this.getBoolean('ENABLE_2FA_ENFORCEMENT'),
      ENABLE_SECURITY_ALERTS: this.getBoolean('ENABLE_SECURITY_ALERTS', true),
      ENABLE_SLACK_ALERTS: this.getBoolean('ENABLE_SLACK_ALERTS'),
      ENABLE_TELEGRAM_ALERTS: this.getBoolean('ENABLE_TELEGRAM_ALERTS'),
      SLACK_WEBHOOK_URL: this.getString('SLACK_WEBHOOK_URL'),
      TELEGRAM_BOT_TOKEN: this.getString('TELEGRAM_BOT_TOKEN'),
      TELEGRAM_CHAT_ID: this.getString('TELEGRAM_CHAT_ID'),
      
      // Marketplace APIs
      YANDEX_MARKET_API_KEY: this.getString('YANDEX_MARKET_API_KEY'),
      YANDEX_MARKET_CLIENT_ID: this.getString('YANDEX_MARKET_CLIENT_ID'),
      ALIEXPRESS_APP_KEY: this.getString('ALIEXPRESS_APP_KEY'),
      ALIEXPRESS_APP_SECRET: this.getString('ALIEXPRESS_APP_SECRET'),
      ADMITAD_CAMPAIGN_ID: this.getString('ADMITAD_CAMPAIGN_ID'),
    };

    // Production-specific validations
    if (isProduction) {
      if (!config.JWT_SECRET || config.JWT_SECRET.length < 32) {
        this.errors.push('JWT_SECRET must be at least 32 characters in production');
      }
      
      if (!config.SESSION_SECRET || config.SESSION_SECRET.length < 32) {
        this.errors.push('SESSION_SECRET must be at least 32 characters in production');
      }
      
      // HTTPS enforcement warning
      if (!config.FRONTEND_URL.startsWith('https://')) {
        const logger = require('../utils/logger').default;
        logger.warn('⚠️  WARNING: FRONTEND_URL should use HTTPS in production!');
      }
    }

    // Development: Generate secure secrets if not provided
    if (!isProduction) {
      const logger = require('../utils/logger').default;
      if (!config.JWT_SECRET) {
        const crypto = require('crypto');
        config.JWT_SECRET = crypto.randomBytes(32).toString('hex');
        logger.warn('JWT_SECRET not set, generated random secret for development');
        logger.warn('Add this to your .env file: JWT_SECRET=' + config.JWT_SECRET);
      }
      if (!config.SESSION_SECRET) {
        const crypto = require('crypto');
        config.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
        logger.warn('SESSION_SECRET not set, generated random secret for development');
        logger.warn('Add this to your .env file: SESSION_SECRET=' + config.SESSION_SECRET);
      }
    }

    if (this.errors.length > 0) {
      const logger = require('../utils/logger').default;
      logger.error('Environment validation failed:');
      this.errors.forEach(error => logger.error(`   - ${error}`));
      throw new Error('Invalid environment configuration');
    }

    return config;
  }
}

export const env = new EnvValidator().validate();
export default env;
