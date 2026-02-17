-- Migration: Ultimate Security Features
-- Date: 2026-02-17
-- Description: Adds tables for 2FA, intrusion prevention, vulnerability scanning, DDoS protection, and anomaly detection

-- ============================================
-- 2FA (Two-Factor Authentication)
-- ============================================

CREATE TABLE IF NOT EXISTS user_2fa_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret VARCHAR(255) NOT NULL,
  enabled BOOLEAN DEFAULT false,
  backup_codes TEXT, -- JSON array of backup codes
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_2fa_user_id ON user_2fa_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_2fa_enabled ON user_2fa_settings(enabled);

-- ============================================
-- Intrusion Prevention System
-- ============================================

CREATE TABLE IF NOT EXISTS intrusion_attempts (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  attack_type VARCHAR(100) NOT NULL, -- sql_injection, xss, path_traversal, etc.
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intrusion_ip ON intrusion_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_intrusion_user ON intrusion_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_intrusion_type ON intrusion_attempts(attack_type);
CREATE INDEX IF NOT EXISTS idx_intrusion_severity ON intrusion_attempts(severity);
CREATE INDEX IF NOT EXISTS idx_intrusion_created ON intrusion_attempts(created_at);

-- IP Blacklist
CREATE TABLE IF NOT EXISTS ip_blacklist (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blacklist_ip ON ip_blacklist(ip_address);

-- ============================================
-- Vulnerability Scanner
-- ============================================

CREATE TABLE IF NOT EXISTS vulnerability_scans (
  id SERIAL PRIMARY KEY,
  scan_id VARCHAR(100) NOT NULL UNIQUE,
  timestamp TIMESTAMP NOT NULL,
  vulnerabilities JSONB NOT NULL,
  summary JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vuln_scan_id ON vulnerability_scans(scan_id);
CREATE INDEX IF NOT EXISTS idx_vuln_timestamp ON vulnerability_scans(timestamp);

-- ============================================
-- Anomaly Detection
-- ============================================

CREATE TABLE IF NOT EXISTS user_behavior_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_data JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_behavior_user ON user_behavior_profiles(user_id);

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
CREATE INDEX IF NOT EXISTS idx_anomaly_ip ON anomaly_detections(ip_address);
CREATE INDEX IF NOT EXISTS idx_anomaly_risk ON anomaly_detections(risk);
CREATE INDEX IF NOT EXISTS idx_anomaly_detected ON anomaly_detections(detected_at);

-- ============================================
-- Security Monitoring
-- ============================================

CREATE TABLE IF NOT EXISTS security_incidents (
  id SERIAL PRIMARY KEY,
  incident_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  affected_users INTEGER[],
  affected_ips VARCHAR(45)[],
  status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive')),
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_incident_type ON security_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_incident_severity ON security_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incident_status ON security_incidents(status);
CREATE INDEX IF NOT EXISTS idx_incident_created ON security_incidents(created_at);

-- ============================================
-- WAF (Web Application Firewall) Logs
-- ============================================

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
CREATE INDEX IF NOT EXISTS idx_waf_rule ON waf_blocks(rule_id);
CREATE INDEX IF NOT EXISTS idx_waf_blocked ON waf_blocks(blocked_at);

-- ============================================
-- Secrets Management
-- ============================================

CREATE TABLE IF NOT EXISTS secret_rotations (
  id SERIAL PRIMARY KEY,
  secret_type VARCHAR(100) NOT NULL, -- jwt_secret, api_key, db_password, etc.
  rotated_at TIMESTAMP DEFAULT NOW(),
  rotated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  old_secret_hash VARCHAR(255), -- Hash of old secret for audit
  new_secret_hash VARCHAR(255)  -- Hash of new secret for audit
);

CREATE INDEX IF NOT EXISTS idx_secret_type ON secret_rotations(secret_type);
CREATE INDEX IF NOT EXISTS idx_secret_rotated ON secret_rotations(rotated_at);

-- ============================================
-- Rate Limiting Enhanced
-- ============================================

CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  endpoint VARCHAR(255) NOT NULL,
  limit_type VARCHAR(50) NOT NULL, -- global, endpoint, user, api_key
  violations_count INTEGER DEFAULT 1,
  first_violation TIMESTAMP DEFAULT NOW(),
  last_violation TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_ip ON rate_limit_violations(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limit_user ON rate_limit_violations(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_endpoint ON rate_limit_violations(endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limit_last ON rate_limit_violations(last_violation);

-- ============================================
-- Geo-blocking
-- ============================================

CREATE TABLE IF NOT EXISTS geo_blocks (
  id SERIAL PRIMARY KEY,
  country_code VARCHAR(2) NOT NULL,
  reason TEXT,
  blocked_at TIMESTAMP DEFAULT NOW(),
  blocked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP,
  UNIQUE(country_code)
);

CREATE INDEX IF NOT EXISTS idx_geo_country ON geo_blocks(country_code);
CREATE INDEX IF NOT EXISTS idx_geo_expires ON geo_blocks(expires_at);

-- ============================================
-- Security Alerts
-- ============================================

CREATE TABLE IF NOT EXISTS security_alerts (
  id SERIAL PRIMARY KEY,
  alert_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  details JSONB,
  status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'resolved', 'ignored')),
  created_at TIMESTAMP DEFAULT NOW(),
  acknowledged_at TIMESTAMP,
  acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_alert_type ON security_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alert_severity ON security_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alert_status ON security_alerts(status);
CREATE INDEX IF NOT EXISTS idx_alert_created ON security_alerts(created_at);

-- ============================================
-- Add account locking fields to users table
-- ============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS account_locked BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lock_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_users_locked ON users(account_locked);

-- ============================================
-- Performance Optimization Tables
-- ============================================

-- Materialized view for popular products (will be refreshed periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_popular_products AS
SELECT 
  product_id,
  COUNT(*) as click_count,
  COUNT(DISTINCT user_id) as unique_users,
  MAX(created_at) as last_clicked
FROM click_analytics
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY product_id
ORDER BY click_count DESC
LIMIT 100;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_popular_product ON mv_popular_products(product_id);

-- Materialized view for search statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_search_stats AS
SELECT 
  query,
  COUNT(*) as search_count,
  COUNT(DISTINCT user_id) as unique_users,
  MAX(created_at) as last_searched
FROM search_history
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY query
ORDER BY search_count DESC
LIMIT 100;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_search_query ON mv_search_stats(query);

-- ============================================
-- Partitioning for large tables (PostgreSQL 10+)
-- ============================================

-- Note: Partitioning requires manual setup based on data volume
-- Example for audit_log partitioning by month:
-- CREATE TABLE audit_log_2026_02 PARTITION OF audit_log
--   FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- ============================================
-- Functions for automatic cleanup
-- ============================================

-- Function to clean old intrusion attempts
CREATE OR REPLACE FUNCTION cleanup_old_intrusion_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM intrusion_attempts WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Function to clean old anomaly detections
CREATE OR REPLACE FUNCTION cleanup_old_anomaly_detections()
RETURNS void AS $$
BEGIN
  DELETE FROM anomaly_detections WHERE detected_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Function to clean old WAF blocks
CREATE OR REPLACE FUNCTION cleanup_old_waf_blocks()
RETURNS void AS $$
BEGIN
  DELETE FROM waf_blocks WHERE blocked_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_security_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_popular_products;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_search_stats;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Triggers
-- ============================================

-- Trigger to update updated_at on user_2fa_settings
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_2fa_updated_at
  BEFORE UPDATE ON user_2fa_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Initial data
-- ============================================

-- Insert default security incident types
INSERT INTO security_incidents (incident_type, severity, description, status, details)
VALUES 
  ('system_initialized', 'low', 'Ultimate security system initialized', 'resolved', '{"version": "1.0.0"}')
ON CONFLICT DO NOTHING;

-- ============================================
-- Grants (if needed)
-- ============================================

-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE user_2fa_settings IS 'Two-factor authentication settings for users';
COMMENT ON TABLE intrusion_attempts IS 'Log of detected intrusion attempts';
COMMENT ON TABLE ip_blacklist IS 'Permanently blocked IP addresses';
COMMENT ON TABLE vulnerability_scans IS 'Results of security vulnerability scans';
COMMENT ON TABLE user_behavior_profiles IS 'Machine learning profiles for anomaly detection';
COMMENT ON TABLE anomaly_detections IS 'Detected anomalies in user behavior';
COMMENT ON TABLE security_incidents IS 'Security incidents requiring investigation';
COMMENT ON TABLE waf_blocks IS 'Web Application Firewall block logs';
COMMENT ON TABLE secret_rotations IS 'Audit log of secret rotations';
COMMENT ON TABLE rate_limit_violations IS 'Rate limiting violation logs';
COMMENT ON TABLE geo_blocks IS 'Country-level geo-blocking configuration';
COMMENT ON TABLE security_alerts IS 'Security alerts for monitoring team';

-- Migration complete
SELECT 'Ultimate Security Migration Completed Successfully' as status;
