#!/bin/bash

# Database backup script

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="${DB_NAME:-smartprice}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/smartprice_backup_$TIMESTAMP.sql"

echo "📦 Creating database backup..."
pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -F c -b -v -f "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "✅ Backup created: $BACKUP_FILE"
  
  # Compress backup
  gzip "$BACKUP_FILE"
  echo "✅ Backup compressed: ${BACKUP_FILE}.gz"
  
  # Delete backups older than 30 days
  find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
  echo "🧹 Cleaned up old backups"
  
  exit 0
else
  echo "❌ Backup failed!"
  exit 1
fi
