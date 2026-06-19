#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/opportunity-$STAMP.sql.gz"
find "$BACKUP_DIR" -type f -name 'opportunity-*.sql.gz' -mtime +14 -delete
