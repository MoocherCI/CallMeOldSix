#!/usr/bin/env bash
# Daily PostgreSQL backup for cuneim on 252 (data host).
# Keeps the latest ${KEEP} daily dumps, logs to backup.log.
# Expected to run from cron as user "john" (member of docker group).
set -euo pipefail

BACKUP_DIR=/home/john/backups
KEEP=${BACKUP_KEEP:-7}
TS=$(date +%Y%m%d_%H%M%S)
DUMP="$BACKUP_DIR/cuneim_daily_${TS}.dump"
LOG="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR"

# 1) dump full database (custom format, compressed)
docker exec cuneim-postgres-1 pg_dump -U postgres -d cuneim -Fc > "$DUMP" 2>>"$LOG"

# 2) verify the dump is readable (fail loudly if not)
docker run --rm -v "$BACKUP_DIR":/b:ro postgres:16-alpine \
  pg_restore --list "/b/$(basename "$DUMP")" >/dev/null 2>>"$LOG"

# 3) prune old dumps, keep KEEP most recent
ls -t "$BACKUP_DIR"/cuneim_daily_*.dump 2>/dev/null \
  | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "$(date -u +%FT%T) backup ok: $(basename "$DUMP") size=$(stat -c%s "$DUMP")" >> "$LOG"
