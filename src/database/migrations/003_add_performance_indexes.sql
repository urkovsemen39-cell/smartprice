-- Migration: Performance Optimization Indexes
-- Date: 2026-02-17
-- Description: Adds missing indexes for frequently queried columns

-- ============================================
-- User Sessions Optimization
-- ============================================

-- Composite index for active session lookup
CREATE INDEX IF NOT EXISTS idx_user_sessions_active_lookup 
ON user_sessions(user_id, is_active, expires_at) 
WHERE is_active = true;

-- Index for session cleanup queries
CREATE INDEX IF NOT EXISTS idx_user_sessions_cleanup 
ON user_sessions(expires_at, last_activity) 
WHERE is_active = true;

-- ============================================
-- Refresh Tokens Optimization
-- ============================================

-- Index for token validation
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_validation 
ON refresh_tokens(token_hash, revoked, expires_at);

-- Index for user token lookup
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active 
ON refresh_tokens(user_id, revoked, expires_at) 
WHERE revoked = false;

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_cleanup 
ON refresh_tokens(expires_at, revoked_at) 
WHERE revoked = true;

-- ============================================
-- Login Attempts Optimization
-- ============================================

-- Composite index for rate limiting checks
CREATE INDEX IF NOT EXISTS idx_login_attempts_rate_limit 
ON login_attempts(email, attempted_at DESC, success);

-- Index for IP-based analysis
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time 
ON login_attempts(ip_address, attempted_at DESC);

-- ============================================
-- Audit Logs Optimization
-- ============================================

-- Index for user activity queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time 
ON audit_logs(user_id, created_at DESC);

-- Index for action-based queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_time 
ON audit_logs(action, created_at DESC);

-- Index for IP-based queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_time 
ON audit_logs(ip_address, created_at DESC);

-- ============================================
-- Security Tables Optimization
-- ============================================

-- Index for active IP blocks
CREATE INDEX IF NOT EXISTS idx_ip_blocks_active 
ON ip_blocks(ip_address, expires_at) 
WHERE expires_at > NOW() OR permanent = true;

-- Index for anomaly detection queries
CREATE INDEX IF NOT EXISTS idx_anomaly_detections_recent 
ON anomaly_detections(user_id, detected_at DESC, risk);

-- Index for intrusion attempts analysis
CREATE INDEX IF NOT EXISTS idx_intrusion_attempts_recent 
ON intrusion_attempts(ip_address, created_at DESC, severity);

-- Index for WAF blocks analysis
CREATE INDEX IF NOT EXISTS idx_waf_blocks_recent 
ON waf_blocks(ip_address, blocked_at DESC, rule_id);

-- ============================================
-- API Keys Optimization
-- ============================================

-- Index for API key validation
CREATE INDEX IF NOT EXISTS idx_api_keys_validation 
ON api_keys(key_hash, revoked, expires_at);

-- Index for user API keys
CREATE INDEX IF NOT EXISTS idx_api_keys_user_active 
ON api_keys(user_id, revoked) 
WHERE revoked = false;

-- ============================================
-- Email Verification Optimization
-- ============================================

-- Index for code validation
CREATE INDEX IF NOT EXISTS idx_email_verifications_code 
ON email_verifications(code, used, expires_at) 
WHERE used = false;

-- Index for user verification status
CREATE INDEX IF NOT EXISTS idx_email_verifications_user 
ON email_verifications(user_id, used, expires_at);

-- ============================================
-- Product Tables Optimization
-- ============================================

-- Index for favorites lookup
CREATE INDEX IF NOT EXISTS idx_favorites_user_marketplace 
ON favorites(user_id, marketplace, added_at DESC);

-- Index for price tracking active items
CREATE INDEX IF NOT EXISTS idx_price_tracking_active_user 
ON price_tracking(user_id, active, notified) 
WHERE active = true;

-- Index for price tracking notifications
CREATE INDEX IF NOT EXISTS idx_price_tracking_notify 
ON price_tracking(active, notified, current_price, target_price) 
WHERE active = true AND notified = false;

-- Index for price history queries
CREATE INDEX IF NOT EXISTS idx_price_history_product_time 
ON price_history(product_id, marketplace, recorded_at DESC);

-- Index for search history
CREATE INDEX IF NOT EXISTS idx_search_history_user_time 
ON search_history(user_id, searched_at DESC);

-- ============================================
-- Analytics Optimization
-- ============================================

-- Index for click analytics
CREATE INDEX IF NOT EXISTS idx_click_analytics_product 
ON click_analytics(product_id, clicked_at DESC);

-- Index for click analytics by user
CREATE INDEX IF NOT EXISTS idx_click_analytics_user 
ON click_analytics(user_id, clicked_at DESC);

-- ============================================
-- Statistics
-- ============================================

-- Analyze tables to update statistics
ANALYZE users;
ANALYZE user_sessions;
ANALYZE refresh_tokens;
ANALYZE login_attempts;
ANALYZE audit_logs;
ANALYZE favorites;
ANALYZE price_tracking;
ANALYZE price_history;
ANALYZE search_history;
ANALYZE intrusion_attempts;
ANALYZE anomaly_detections;
ANALYZE waf_blocks;

-- Migration complete
SELECT 'Performance Indexes Migration Completed Successfully' as status;
