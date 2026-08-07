#!/usr/bin/env bash
# 上传二进制文件到 251 的公开下载目录（d.cuneim.com）
#
# 用法:
#   ./scripts/upload-download.sh <本地文件|目录> [远端路径]
#     远端路径默认为本地 basename；目录会递归上传
#
# 环境变量（与 deploy workflow 同命名）:
#   DEPLOY_HOST_251  251 公网 IP 或主机名（必填）
#   DEPLOY_USER_251  251 SSH 用户（必填）
#   SSH_KEY_PATH     SSH 私钥路径（默认 ~/.ssh/id_ed25519）
#
# 一次性迁移 S3 存量（本机执行）:
#   mkdir -p /tmp/cuneim-downloads
#   aws s3 sync s3://<原bucket> /tmp/cuneim-downloads
#   ./scripts/upload-download.sh /tmp/cuneim-downloads/
set -euo pipefail

: "${DEPLOY_HOST_251:?需要设置 DEPLOY_HOST_251}"
: "${DEPLOY_USER_251:?需要设置 DEPLOY_USER_251}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_ed25519}"
[ $# -ge 1 ] || { echo "用法: $0 <本地文件|目录> [远端路径]" >&2; exit 1; }

LOCAL_PATH="$1"
REMOTE_PATH="${2:-}"
# 目录模式：本地路径以 / 结尾 → 内容直接同步到远端下载目录根
if [ -z "$REMOTE_PATH" ]; then
  case "$LOCAL_PATH" in
    */) REMOTE_PATH="" ;;                       # rsync 目录内容到根
    *)  REMOTE_PATH="$(basename "$LOCAL_PATH")" ;;  # 单文件/目录整体
  esac
fi
REMOTE_DIR=~/cuneim/downloads

SSH_OPTS=(-i "$SSH_KEY_PATH" -o StrictHostKeyChecking=accept-new)
TARGET="${DEPLOY_USER_251}@${DEPLOY_HOST_251}"

echo "=== 确保远端目录存在: ${REMOTE_DIR} ==="
ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p ${REMOTE_DIR}"

echo "=== 上传 ${LOCAL_PATH} → ${TARGET}:${REMOTE_DIR}/${REMOTE_PATH} ==="
rsync -avz -e "ssh ${SSH_OPTS[*]}" "$LOCAL_PATH" "${TARGET}:${REMOTE_DIR}/${REMOTE_PATH}"

echo ""
if [ -z "$REMOTE_PATH" ]; then
  echo "OK: 已同步到 https://d.cuneim.com/"
else
  echo "OK: https://d.cuneim.com/${REMOTE_PATH}"
fi
