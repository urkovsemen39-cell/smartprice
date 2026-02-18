#!/bin/bash

# Database restore script

if [ -z "$1" ]; then
  echo "Usage: ./restore-db.sh <backup_file>"
  exit 1
fi

BACKUP_FILE=$1
DB_NAME="${DB_NAME:-smartprice}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Decompress if needed
if [[ $BACKUP_FILE == *.gz ]]; then
  echo "📦 Decompressing backup..."
  gunzip -c "$BACKUP_FILE" > "${BACKUP_FILE%.gz}"
  BACKUP_FILE="${BACKUP_FILE%.gz}"
fi

echo "⚠️  WARNING: This will overwrite the current database!"
read -p "Are you sure? (yes/no): " -r
if [[ ! $REPLY =~ ^yes$ ]]; then
  echo "Restore cancelled"
  exit 0
fi

echo "🔄 Restoring database..."
pg_restore -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c -v "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "✅ Database restored successfully!"
  exit 0
else
  echo "❌ Restore failed!"
  exit 1
fi
