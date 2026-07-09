#!/bin/bash
set -e

# Backup script for database and configuration
# This script is intended to run as a cron job in the operations environment

echo "Starting backup process..."
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/tmp/backups/$DATE"
mkdir -p "$BACKUP_DIR"

# 1. Supabase Postgres Backup (using pg_dump if credentials are provided)
# Note: In a managed Supabase env, PITR (Point in Time Recovery) is usually preferred,
# but we do a logical backup here as part of the backup strategy.

if [ -n "$SUPABASE_DB_URL" ]; then
    echo "Dumping database..."
    pg_dump "$SUPABASE_DB_URL" > "$BACKUP_DIR/db_backup.sql"
else
    echo "Warning: SUPABASE_DB_URL not set. Skipping DB logical backup."
fi

# 2. Archive local state/config if any
# (Not storing secrets, just non-sensitive configs)
echo "Archiving configs..."
tar -czf "$BACKUP_DIR/configs.tar.gz" .env.example railway.toml

echo "Backup completed successfully at $BACKUP_DIR"
# In a real scenario, this would be uploaded to S3 or GCS
# e.g., aws s3 cp "$BACKUP_DIR" s3://my-backup-bucket/$DATE --recursive
