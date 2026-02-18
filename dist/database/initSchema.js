"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDatabase = initializeDatabase;
const database_1 = __importDefault(require("../config/database"));
const SCHEMA_SQL = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
  email_verified BOOLEAN DEFAULT FALSE,
  email_verified_at TIMESTAMP,
  account_locked BOOLEAN DEFAULT false,
  locked_at TIMESTAMP,
  lock_reason TEXT,
  password_changed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_locked ON users(account_locked);

-- Login attempts table (для безопасности и аудита)
CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  success BOOLEAN NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  attempted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at ON login_attempts(attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_success ON login_attempts(success, attempted_at DESC);

-- Favorites table
CREATE TABLE IF NOT EXISTS favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL,
  marketplace VARCHAR(100) NOT NULL,
  product_name VARCHAR(500),
  product_price DECIMAL(10, 2),
  product_image TEXT,
  product_url TEXT,
  added_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_product_id ON favorites(product_id);
CREATE INDEX IF NOT EXISTS idx_favorites_marketplace ON favorites(marketplace);

-- Search history table
CREATE TABLE IF NOT EXISTS search_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  filters JSONB,
  results_count INTEGER,
  searched_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_searched_at ON search_history(searched_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_history_query ON search_history USING gin(to_tsvector('russian', query));

-- Price tracking table
CREATE TABLE IF NOT EXISTS price_tracking (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL,
  marketplace VARCHAR(100) NOT NULL,
  product_name VARCHAR(500),
  target_price DECIMAL(10, 2) NOT NULL,
  current_price DECIMAL(10, 2) NOT NULL,
  product_url TEXT,
  notified BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_tracking_user_id ON price_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_price_tracking_active ON price_tracking(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_price_tracking_product ON price_tracking(product_id, marketplace);
CREATE INDEX IF NOT EXISTS idx_price_tracking_notified ON price_tracking(notified, active) WHERE active = true AND notified = false;

-- Price history table
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  product_id VARCHAR(255) NOT NULL,
  marketplace VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id, marketplace);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_product_date ON price_history(product_id, marketplace, recorded_at DESC);

-- Click analytics table
CREATE TABLE IF NOT EXISTS click_analytics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  product_id VARCHAR(255) NOT NULL,
  marketplace VARCHAR(100) NOT NULL,
  query TEXT,
  clicked_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_click_analytics_clicked_at ON click_analytics(clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_analytics_product ON click_analytics(product_id);
CREATE INDEX IF NOT EXISTS idx_click_analytics_user_id ON click_analytics(user_id) WHERE user_id IS NOT NULL;

-- Popular queries table
CREATE TABLE IF NOT EXISTS popular_queries (
  id SERIAL PRIMARY KEY,
  query TEXT UNIQUE NOT NULL,
  search_count INTEGER DEFAULT 1,
  last_searched TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_popular_queries_count ON popular_queries(search_count DESC);
CREATE INDEX IF NOT EXISTS idx_popular_queries_last_searched ON popular_queries(last_searched DESC);
`;
async function initializeDatabase() {
    const logger = require('../utils/logger').default;
    try {
        logger.info('🔍 Checking if database is initialized...');
        // Проверяем, существует ли таблица users
        const result = await database_1.default.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
        const tableExists = result.rows[0].exists;
        if (tableExists) {
            logger.info('✅ Database already initialized');
            return;
        }
        logger.info('📊 Initializing database schema...');
        // Выполняем SQL
        await database_1.default.query(SCHEMA_SQL);
        logger.info('✅ Database schema initialized successfully');
    }
    catch (error) {
        logger.error('❌ Failed to initialize database:', error);
        throw error;
    }
}
