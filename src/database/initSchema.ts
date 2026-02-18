import db from '../config/database';

const SCHEMA_SQL = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator', 'owner')),
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

-- Login attempts table
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

-- Intrusion attempts table
CREATE TABLE IF NOT EXISTS intrusion_attempts (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  attack_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intrusion_ip ON intrusion_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_intrusion_created ON intrusion_attempts(created_at);

-- Anomaly detections table
CREATE TABLE IF NOT EXISTS anomaly_detections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address VARCHAR(45) NOT NULL,
  score INTEGER NOT NULL,
  anomalies JSONB NOT NULL,
  risk VARCHAR(20) NOT NULL CHECK (risk IN ('low', 'medium', 'high', 'critical')),
  detected_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_user ON anomaly_detections(user_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_detected ON anomaly_detections(detected_at);

-- User behavior profiles
CREATE TABLE IF NOT EXISTS user_behavior_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_data JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  revoked BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

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

-- Price history table
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  product_id VARCHAR(255) NOT NULL,
  marketplace VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id, marketplace);

-- Click analytics table
CREATE TABLE IF NOT EXISTS click_analytics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  product_id VARCHAR(255) NOT NULL,
  marketplace VARCHAR(100) NOT NULL,
  query TEXT,
  clicked_at TIMESTAMP DEFAULT NOW()
);

-- Popular queries table
CREATE TABLE IF NOT EXISTS popular_queries (
  id SERIAL PRIMARY KEY,
  query TEXT UNIQUE NOT NULL,
  search_count INTEGER DEFAULT 1,
  last_searched TIMESTAMP DEFAULT NOW()
);

-- Email verifications
CREATE TABLE IF NOT EXISTS email_verifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  attempts INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  active BOOLEAN DEFAULT TRUE,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

-- API keys
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(64) UNIQUE NOT NULL,
  key_prefix VARCHAR(10) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id INTEGER,
  ip_address VARCHAR(45),
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backups table
CREATE TABLE IF NOT EXISTS backups (
  id SERIAL PRIMARY KEY,
  backup_id VARCHAR(255) UNIQUE NOT NULL,
  filename VARCHAR(255) NOT NULL,
  size BIGINT NOT NULL,
  components JSONB NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- WAF blocks table
CREATE TABLE IF NOT EXISTS waf_blocks (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  rule_id VARCHAR(100) NOT NULL,
  rule_description TEXT,
  request_method VARCHAR(10),
  request_path TEXT,
  request_headers JSONB,
  request_body TEXT,
  blocked_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waf_ip ON waf_blocks(ip_address);
CREATE INDEX IF NOT EXISTS idx_waf_blocked ON waf_blocks(blocked_at);

-- CSP violations table
CREATE TABLE IF NOT EXISTS csp_violations (
  id SERIAL PRIMARY KEY,
  document_uri TEXT,
  violated_directive TEXT,
  blocked_uri TEXT,
  source_file TEXT,
  line_number INTEGER,
  column_number INTEGER,
  user_agent TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_csp_violations_created_at ON csp_violations(created_at);
CREATE INDEX IF NOT EXISTS idx_csp_violations_directive ON csp_violations(violated_directive);

-- Rate limit violations table
CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  endpoint VARCHAR(255) NOT NULL,
  limit_type VARCHAR(50) NOT NULL,
  violations_count INTEGER DEFAULT 1,
  first_violation TIMESTAMP DEFAULT NOW(),
  last_violation TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_ip ON rate_limit_violations(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limit_last ON rate_limit_violations(last_violation);
`;

export async function initializeDatabase() {
  const logger = require('../utils/logger').default;
  
  try {
    logger.info('🔍 Checking if database is initialized...');
    
    // Проверяем, существует ли таблица users
    const result = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    
    const tableExists = result.rows[0].exists;
    
    if (!tableExists) {
      logger.info('📊 Initializing database schema...');
      
      // Выполняем SQL
      await db.query(SCHEMA_SQL);
      
      logger.info('✅ Database schema initialized successfully');
    } else {
      logger.info('✅ Database already initialized');
      
      // Проверяем и создаем недостающие таблицы
      logger.info('🔄 Ensuring all tables exist...');
      await db.query(SCHEMA_SQL);
      logger.info('✅ All tables verified');
    }
    
  } catch (error) {
    logger.error('❌ Failed to initialize database:', error);
    // Не бросаем ошибку, чтобы сервер мог запуститься
    logger.warn('⚠️  Server will start without full database initialization');
  }
}
