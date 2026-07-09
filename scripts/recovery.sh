#!/bin/bash
# Recovery Script for INSAI Database (Supabase / Postgres)
# Requires psql installed

set -e

# Configuration
DB_URL=${DATABASE_URL:-""}
BACKUP_FILE=$1

if [ -z "$DB_URL" ]; then
  echo "Error: DATABASE_URL is not set."
  exit 1
fi

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./recovery.sh <path_to_backup_file.sql.gz>"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file $BACKUP_FILE does not exist."
  exit 1
fi

echo "WARNING: This will overwrite the current database."
read -p "Are you sure you want to proceed? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Recovery cancelled."
    exit 1
fi

echo "Starting recovery process..."

# Uncompress and restore
echo "Restoring database from $BACKUP_FILE..."
gunzip -c "$BACKUP_FILE" | psql "$DB_URL"

echo "Recovery completed successfully."
