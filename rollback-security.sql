-- Rollback security tables
DROP TABLE IF EXISTS security_alerts CASCADE;
DROP TABLE IF EXISTS geo_blocks CASCADE;
DROP TABLE IF EXISTS rate_limit_violations CASCADE;
DROP TABLE IF EXISTS secret_rotations CASCADE;
DROP TABLE IF EXISTS waf_blocks CASCADE;
DROP TABLE IF EXISTS security_incidents CASCADE;
DROP TABLE IF EXISTS anomaly_detections CASCADE;
DROP TABLE IF EXISTS user_behavior_profiles CASCADE;
DROP TABLE IF EXISTS vulnerability_scans CASCADE;
DROP TABLE IF EXISTS ip_blacklist CASCADE;
DROP TABLE IF EXISTS intrusion_attempts CASCADE;
DROP TABLE IF EXISTS user_2fa_settings CASCADE;

-- Remove added columns from users table
ALTER TABLE users DROP COLUMN IF EXISTS account_locked;
ALTER TABLE users DROP COLUMN IF EXISTS locked_at;
ALTER TABLE users DROP COLUMN IF EXISTS lock_reason;
ALTER TABLE users DROP COLUMN IF EXISTS password_changed_at;

-- Drop functions
DROP FUNCTION IF EXISTS cleanup_old_intrusion_attempts();
DROP FUNCTION IF EXISTS cleanup_old_anomaly_detections();
DROP FUNCTION IF EXISTS cleanup_old_waf_blocks();
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

SELECT 'Rollback completed' as status;
