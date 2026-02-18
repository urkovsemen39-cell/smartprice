-- Migration: Add Refresh Tokens and User Roles
-- Description: Добавление refresh tokens для безопасной аутентификации и системы ролей

-- Add roles to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active ON refresh_tokens(user_id, revoked, expires_at) WHERE revoked = false;

-- Update existing users to have 'user' role
UPDATE users SET role = 'user' WHERE role IS NULL;

-- Add constraint to ensure valid roles
ALTER TABLE users ADD CONSTRAINT check_user_role CHECK (role IN ('user', 'admin', 'moderator'));

COMMENT ON TABLE refresh_tokens IS 'Refresh tokens for secure authentication';
COMMENT ON COLUMN users.role IS 'User role: user, admin, or moderator';
