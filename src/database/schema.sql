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

-- Popular queries table (materialized view alternative)
CREATE TABLE IF NOT EXISTS popular_queries (
  id SERIAL PRIMARY KEY,
  query TEXT UNIQUE NOT NULL,
  search_count INTEGER DEFAULT 1,
  last_searched TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_popular_queries_count ON popular_queries(search_count DESC);
CREATE INDEX IF NOT EXISTS idx_popular_queries_last_searched ON popular_queries(last_searched DESC);

-- Refresh tokens table (для JWT refresh token rotation)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active ON refresh_tokens(user_id, revoked, expires_at) WHERE revoked = FALSE;

-- User sessions table (для session management)
CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  last_activity TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, expires_at) WHERE expires_at > NOW();

-- Email verifications table
CREATE TABLE IF NOT EXISTS email_verifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(10) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_code ON email_verifications(code, expires_at) WHERE verified = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_verifications_expires_at ON email_verifications(expires_at);

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  permissions JSONB DEFAULT '[]'::jsonb,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(user_id, revoked, expires_at) WHERE revoked = FALSE;

-- Two-factor authentication table
CREATE TABLE IF NOT EXISTS two_factor_auth (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  secret VARCHAR(255) NOT NULL,
  backup_codes JSONB,
  enabled BOOLEAN DEFAULT FALSE,
  enabled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_two_factor_auth_user_id ON two_factor_auth(user_id);
CREATE INDEX IF NOT EXISTS idx_two_factor_auth_enabled ON two_factor_auth(enabled) WHERE enabled = TRUE;

-- Audit logs table
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
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource, resource_id);

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

-- Enable pg_stat_statements extension for query monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
