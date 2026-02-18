-- Migration: Add Backups Table
-- Таблица для хранения информации о бэкапах

CREATE TABLE IF NOT EXISTS backups (
  id SERIAL PRIMARY KEY,
  backup_id VARCHAR(255) UNIQUE NOT NULL,
  filename VARCHAR(255) NOT NULL,
  size BIGINT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_backup_id ON backups(backup_id);
