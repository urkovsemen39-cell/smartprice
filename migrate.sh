#!/bin/bash
# Скрипт для запуска миграции на Railway

echo "🔄 Running database migration..."

# Проверяем наличие DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is not set"
  echo "Please set it from Railway dashboard: Settings -> Variables -> DATABASE_URL"
  exit 1
fi

# Запускаем миграцию
psql "$DATABASE_URL" -f src/database/migrations/001_add_email_verification.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration completed successfully!"
else
  echo "❌ Migration failed!"
  exit 1
fi
