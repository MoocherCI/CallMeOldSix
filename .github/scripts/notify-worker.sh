#!/usr/bin/env bash
# Worker /notify notification script
# Required env vars: STATUS, ACTOR, DEPLOY_TAG, SERVICES, COMMIT_SHA, COMMIT_MESSAGE, COMMIT_TIME, REPOSITORY, WORKFLOW_URL, WORKER_URL, NOTIFY_SECRET
set -euo pipefail

STATUS_TEXT="success"
if [ "$STATUS" != "success" ]; then
  STATUS_TEXT="failed"
fi

COMMIT_URL="https://github.com/${REPOSITORY}/commit/${COMMIT_SHA}"

curl -s -X POST "${WORKER_URL}/notify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${NOTIFY_SECRET}" \
  -d "{
    \"status\": \"${STATUS_TEXT}\",
    \"actor\": \"${ACTOR}\",
    \"tag\": \"${DEPLOY_TAG}\",
    \"services\": \"${SERVICES}\",
    \"commit_message\": \"${COMMIT_MESSAGE}\",
    \"commit_time\": \"${COMMIT_TIME}\",
    \"commit_sha\": \"${COMMIT_SHA}\",
    \"repository\": \"${REPOSITORY}\",
    \"workflow_url\": \"${WORKFLOW_URL}\",
    \"commit_url\": \"${COMMIT_URL}\"
  }"
