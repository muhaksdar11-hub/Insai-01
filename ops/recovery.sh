#!/bin/bash
set -e

# Recovery script for database
# Usage: ./ops/recovery.sh <backup_date>

if [ -z "$1" ]; then
    echo "Error: Backup date not specified."
    echo "Usage: ./ops/recovery.sh <YYYYMMDD_HHMMSS>"
    exit 1
fi

BACKUP_DIR="/tmp/backups/$1"

if [ ! -d "$BACKUP_DIR" ]; then
    echo "Error: Backup directory $BACKUP_DIR not found!"
    exit 1
fi

echo "Starting recovery process from $BACKUP_DIR..."

if [ -n "$SUPABASE_DB_URL" ] && [ -f "$BACKUP_DIR/db_backup.sql" ]; then
    echo "Restoring database..."
    psql "$SUPABASE_DB_URL" < "$BACKUP_DIR/db_backup.sql"
    echo "Database restored successfully."
else
    echo "Error: Cannot restore DB. Either SUPABASE_DB_URL is unset or backup file missing."
    exit 1
fi

echo "Recovery completed."
