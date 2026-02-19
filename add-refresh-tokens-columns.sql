-- Add missing columns to refresh_tokens table
ALTER TABLE refresh_tokens 
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45),
ADD COLUMN IF NOT EXISTS user_agent TEXT;
