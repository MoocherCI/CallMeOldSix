#!/usr/bin/env bash
# Worker /notify notification script
# Required env vars: STATUS, ACTOR, DEPLOY_TAG, SERVICES, COMMIT_SHA, COMMIT_MESSAGE, COMMIT_TIME, REPOSITORY, WORKFLOW_URL, WORKER_URL, NOTIFY_SECRET, LARK_WEBHOOK
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

# Send notification to Lark Webhook directly (without interactive callback buttons)
if [ -n "${LARK_WEBHOOK:-}" ]; then
  if [ "$STATUS" = "success" ]; then
    TEMPLATE="green"
    STATUS_DISPLAY="✅ Success"
  else
    TEMPLATE="red"
    STATUS_DISPLAY="❌ Failed"
  fi

  SHORT_SHA="${COMMIT_SHA:0:7}"

  WEBHOOK_PAYLOAD=$(cat <<EOF
{
  "msg_type": "interactive",
  "card": {
    "config": {
      "update_multi": true
    },
    "header": {
      "title": {
        "tag": "plain_text",
        "content": "GitHub Action 执行通知"
      },
      "template": "${TEMPLATE}"
    },
    "elements": [
      {
        "tag": "div",
        "text": {
          "tag": "lark_md",
          "content": "**发起人:** ${ACTOR}\n**Tag:** ${DEPLOY_TAG}\n**构建服务:** ${SERVICES}\n**状态:** ${STATUS_DISPLAY}\n**提交信息:** ${COMMIT_MESSAGE}\n**提交时间:** ${COMMIT_TIME}\n**提交:** [${SHORT_SHA}](${COMMIT_URL})"
        }
      },
      {
        "tag": "action",
        "actions": [
          {
            "tag": "button",
            "text": {
              "tag": "plain_text",
              "content": "查看 Workflow"
            },
            "type": "primary",
            "url": "${WORKFLOW_URL}"
          },
          {
            "tag": "button",
            "text": {
              "tag": "plain_text",
              "content": "查看提交"
            },
            "type": "default",
            "url": "${COMMIT_URL}"
          }
        ]
      }
    ]
  }
}
EOF
)

  curl -s -X POST "${LARK_WEBHOOK}" \
    -H "Content-Type: application/json" \
    -d "${WEBHOOK_PAYLOAD}"
fi
