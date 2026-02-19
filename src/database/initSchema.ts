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

-- Two-factor authentication table
CREATE TABLE IF NOT EXISTS two_factor_auth (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret VARCHAR(255) NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  backup_codes TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_two_factor_user ON two_factor_auth(user_id);

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

-- Security events table
CREATE TABLE IF NOT EXISTS security_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  ip_address VARCHAR(45),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  details JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_unresolved ON security_events(resolved, severity, created_at) WHERE resolved = FALSE;

-- IP blocks table
CREATE TABLE IF NOT EXISTS ip_blocks (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) UNIQUE NOT NULL,
  reason TEXT,
  blocked_until TIMESTAMP,
  permanent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ip_blocks_ip ON ip_blocks(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_blocks_active ON ip_blocks(ip_address, blocked_until) WHERE permanent = TRUE OR blocked_until > NOW();

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
  last_used_at TIMESTAMP,
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT
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

-- Audit logs (with 's' - used by owner panel)
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100),
  resource_id VARCHAR(255),
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  success BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

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
      
      // Выполняем миграции для существующих таблиц
      logger.info('🔄 Running database migrations...');
      await runMigrations();
      logger.info('✅ Migrations completed');
    }
    
  } catch (error) {
    logger.error('❌ Failed to initialize database:', error);
    // Не бросаем ошибку, чтобы сервер мог запуститься
    logger.warn('⚠️  Server will start without full database initialization');
  }
}

async function runMigrations() {
  const logger = require('../utils/logger').default;
  
  try {
    // Миграция 1: Добавление колонок в refresh_tokens
    logger.info('  → Adding missing columns to refresh_tokens...');
    await db.query(`
      ALTER TABLE refresh_tokens 
      ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45),
      ADD COLUMN IF NOT EXISTS user_agent TEXT;
    `);
    logger.info('  ✓ refresh_tokens columns added');
    
    // Миграция 2: Добавление колонки totp_secret в users
    logger.info('  → Adding totp_secret column to users...');
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(255);
    `);
    logger.info('  ✓ totp_secret column added');
    
    // Миграция 3: Обновление CHECK constraint для роли
    logger.info('  → Updating role check constraint...');
    try {
      // Удаляем старый constraint
      await db.query(`
        ALTER TABLE users 
        DROP CONSTRAINT IF EXISTS users_role_check;
      `);
      
      // Создаем новый constraint со всеми ролями
      await db.query(`
        ALTER TABLE users 
        ADD CONSTRAINT users_role_check 
        CHECK (role IN ('user', 'admin', 'moderator', 'owner'));
      `);
      logger.info('  ✓ Role check constraint updated');
    } catch (constraintError) {
      logger.error('  ✗ Failed to update constraint:', constraintError);
    }
    
    // Миграция 4: ПРИНУДИТЕЛЬНОЕ назначение роли owner (выполняется ВСЕГДА)
    logger.info('  → FORCE setting owner role for semenbrut007@yandex.ru...');
    try {
      const ownerResult = await db.query(`
        UPDATE users 
        SET role = 'owner' 
        WHERE email = 'semenbrut007@yandex.ru'
        RETURNING id, email, role;
      `);
      if (ownerResult.rowCount && ownerResult.rowCount > 0) {
        logger.info(`  ✓✓✓ OWNER ROLE SET for ${ownerResult.rows[0].email} - current role: ${ownerResult.rows[0].role}`);
      } else {
        logger.error('  ✗✗✗ User semenbrut007@yandex.ru NOT FOUND in database!');
      }
    } catch (roleError) {
      logger.error('  ✗✗✗ Failed to set owner role:', roleError);
    }
    
    // Миграция 5: Копирование TOTP секрета в two_factor_auth
    logger.info('  → Copying TOTP secret to two_factor_auth...');
    try {
      await db.query(`
        INSERT INTO two_factor_auth (user_id, secret, enabled)
        SELECT id, totp_secret, TRUE
        FROM users
        WHERE totp_secret IS NOT NULL
        ON CONFLICT (user_id) DO UPDATE
        SET secret = EXCLUDED.secret;
      `);
      logger.info('  ✓ TOTP secrets copied');
    } catch (totpError) {
      logger.error('  ✗ Failed to copy TOTP secrets:', totpError);
    }
    
  } catch (error) {
    logger.error('Migration error:', error);
    // Не бросаем ошибку, продолжаем работу
  }
}
