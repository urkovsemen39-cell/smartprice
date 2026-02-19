-- Add missing security tables

-- IP Blacklist table (для постоянной блокировки)
CREATE TABLE IF NOT EXISTS ip_blacklist (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) UNIQUE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ip_blacklist_ip ON ip_blacklist(ip_address);

-- Intrusion attempts table (для логирования попыток взлома)
CREATE TABLE IF NOT EXISTS intrusion_attempts (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  attack_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intrusion_attempts_ip ON intrusion_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_intrusion_attempts_created_at ON intrusion_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intrusion_attempts_severity ON intrusion_attempts(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intrusion_attempts_type ON intrusion_attempts(attack_type);
