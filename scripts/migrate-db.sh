#!/usr/bin/env bash
# migrate-db.sh — One-time PostgreSQL migration from old machine to alex-ai-dev-252
# Run manually from operator's local machine.
set -euo pipefail

# === Source (old machine) ===
SSH_KEY_OLD="[REDACTED]"
SSH_HOST_OLD="[REDACTED]"
SSH_USER_OLD="[REDACTED]"

# === Destination (alex-ai-dev-252) ===
SSH_KEY="~/.ssh/[REDACTED]"
SSH_HOST="[REDACTED]"
SSH_USER="[REDACTED]"

# === PostgreSQL connection parameters ===
# Customize these before running.
PG_HOST="localhost"
PG_PORT="5432"
PG_USER="postgres"
DB_NAME="cuneim"   # change to the actual database name

echo "=== Migrating PostgreSQL: ${SSH_USER_OLD}@${SSH_HOST_OLD} -> ${SSH_USER}@${SSH_HOST} ==="
echo "  Database: ${DB_NAME}"
echo ""

echo "Step 1: Dumping database from source (${SSH_HOST_OLD})..."
echo "Step 2: Restoring to destination (${SSH_HOST})..."
echo ""

# Pipe pg_dump from the old machine directly to pg_restore on 252.
# No intermediate file is written to disk (streamed through SSH).
ssh -i "${SSH_KEY_OLD}" "${SSH_USER_OLD}@${SSH_HOST_OLD}" \
  "pg_dump -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -d ${DB_NAME} -Fc" \
  | ssh -i "${SSH_KEY}" "${SSH_USER}@${SSH_HOST}" \
  "pg_restore --clean --if-exists -j 4 -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -d ${DB_NAME}"

echo ""
echo "=== Migration complete: ${SSH_HOST_OLD} -> ${SSH_HOST} ==="
