#!/usr/bin/env bash
# setup-252.sh — One-time environment setup for alex-ai-dev-252
# Run manually from operator's local machine.
set -euo pipefail

# === SSH Configuration ===
SSH_KEY="${SSH_KEY_PATH}"
SSH_HOST="${DEPLOY_HOST_252}"
SSH_USER="${DEPLOY_USER}"
SSH_CMD="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new ${SSH_USER}@${SSH_HOST} 'INTERNAL_SUBNET=${INTERNAL_SUBNET} bash -s'"

echo "=== Setup: ${SSH_USER}@${SSH_HOST} ==="
echo ""

# All remote work runs in a single session for efficiency.
$SSH_CMD << 'REMOTE_EOF'
set -euo pipefail

echo "[1/4] Updating package cache..."
sudo apt-get update -qq
echo "  Done."
echo ""

# --- Docker ---
echo "[2/4] Installing Docker..."
if command -v docker &>/dev/null; then
  echo "  Docker is already installed, skipping."
else
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "  Docker installed."
fi
echo ""

# --- Docker Compose v2 ---
echo "[3/4] Installing Docker Compose v2..."
# Check via the plugin binary or the docker compose subcommand (use sudo
# because the docker group membership has not taken effect in this session).
if sudo docker compose version &>/dev/null 2>&1; then
  echo "  Docker Compose v2 is already installed, skipping."
else
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -fsSL \
    "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  echo "  Docker Compose v2 installed."
fi
echo ""

# --- ufw ---
echo "[4/4] Installing and configuring ufw..."
if command -v ufw &>/dev/null; then
  echo "  ufw is already installed."
else
  sudo apt-get install -y -qq ufw
  echo "  ufw installed."
fi

# Allow SSH and service ports from VPN subnet.
sudo ufw allow proto tcp from ${INTERNAL_SUBNET} to any port 22
sudo ufw allow proto tcp from ${INTERNAL_SUBNET} to any port 5432
sudo ufw allow proto tcp from ${INTERNAL_SUBNET} to any port 6379
sudo ufw allow proto tcp from ${INTERNAL_SUBNET} to any port 3000:3006

echo "  ufw rules configured."
echo ""

# --- Directories ---
echo "Creating directory structure..."
mkdir -p ~/cuneim/shared-logs
mkdir -p ~/cuneim/prisma
echo "  Directories created under ~/cuneim/: shared-logs, prisma"
echo ""

# --- Firewall defaults ---
echo "Setting firewall defaults and enabling ufw..."
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw --force enable
echo "  ufw enabled with default deny incoming."
echo ""

echo "=== Setup complete for ${SSH_HOST} ==="
REMOTE_EOF
