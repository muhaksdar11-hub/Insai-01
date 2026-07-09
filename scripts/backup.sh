#!/bin/bash
# Backup Script for INSAI Database (Supabase / Postgres)
# Requires pg_dump installed

set -e

# Configuration
DB_URL=${DATABASE_URL:-""}
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/insai_db_$TIMESTAMP.sql"

if [ -z "$DB_URL" ]; then
  echo "Error: DATABASE_URL is not set."
  exit 1
fi

echo "Starting backup process..."

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Perform backup
echo "Dumping database to $BACKUP_FILE..."
pg_dump "$DB_URL" > "$BACKUP_FILE"

# Compress backup
echo "Compressing backup..."
gzip "$BACKUP_FILE"

echo "Backup completed successfully: ${BACKUP_FILE}.gz"
