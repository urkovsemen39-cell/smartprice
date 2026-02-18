-- Migration: Add Owner Role
-- Добавление роли 'owner' для единственного владельца системы

-- Обновление CHECK constraint для роли
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('user', 'admin', 'moderator', 'owner'));

-- Примечание: Роль 'owner' должна быть назначена вручную через SQL:
-- UPDATE users SET role = 'owner' WHERE email = 'your-email@example.com';

-- Индекс для быстрого поиска владельца
CREATE INDEX IF NOT EXISTS idx_users_owner ON users(role) WHERE role = 'owner';
