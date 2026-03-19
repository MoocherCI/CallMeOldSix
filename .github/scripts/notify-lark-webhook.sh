#!/usr/bin/env bash
# Lark Webhook notification script
# Required env vars: STATUS, ACTOR, DEPLOY_TAG, SERVICES, COMMIT_SHA, COMMIT_MESSAGE, COMMIT_TIME, REPOSITORY, WORKFLOW_URL, LARK_WEBHOOK
set -euo pipefail

STATUS_TEXT="✅ Success"
TEMPLATE="green"
if [ "$STATUS" != "success" ]; then
  STATUS_TEXT="❌ Failed"
  TEMPLATE="red"
fi

COMMIT_URL="https://github.com/${REPOSITORY}/commit/${COMMIT_SHA}"
COMMIT_SHA_SHORT="${COMMIT_SHA:0:7}"

JSON_PAYLOAD=$(cat <<EOF
{
  "msg_type": "interactive",
  "card": {
    "config": { "update_multi": true },
    "header": {
      "title": { "tag": "plain_text", "content": "GitHub Action 执行通知" },
      "template": "${TEMPLATE}"
    },
    "elements": [
      {
        "tag": "div",
        "text": {
          "tag": "lark_md",
          "content": "**发起人:** ${ACTOR}\n**Tag:** ${DEPLOY_TAG}\n**构建服务:** ${SERVICES}\n**状态:** ${STATUS_TEXT}\n**提交信息:** ${COMMIT_MESSAGE}\n**提交时间:** ${COMMIT_TIME}\n**提交:** [${COMMIT_SHA_SHORT}](${COMMIT_URL})"
        }
      },
      {
        "tag": "action",
        "actions": [
          {
            "tag": "button",
            "text": { "tag": "plain_text", "content": "查看 Workflow" },
            "type": "default",
            "url": "${WORKFLOW_URL}"
          },
          {
            "tag": "button",
            "text": { "tag": "plain_text", "content": "查看提交" },
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

curl -s -X POST "$LARK_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD"
