#!/usr/bin/env bash
# setup-251.sh — One-time environment setup for alex-ai-dev-251
# Run manually from operator's local machine.
set -euo pipefail

# === SSH Configuration ===
SSH_KEY="~/.ssh/id_ed25519_ai_ci"
SSH_HOST="91.110.182.251"
SSH_USER="john"
SSH_CMD="ssh -i ${SSH_KEY} ${SSH_USER}@${SSH_HOST}"

echo "=== Setup: ${SSH_USER}@${SSH_HOST} ==="
echo ""

# All remote work runs in a single session for efficiency.
$SSH_CMD 'bash -s' << 'REMOTE_EOF'
set -euo pipefail

echo "[1/6] Updating package cache..."
sudo apt-get update -qq
echo "  Done."
echo ""

# --- Docker ---
echo "[2/6] Installing Docker..."
if command -v docker &>/dev/null; then
  echo "  Docker is already installed, skipping."
else
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "  Docker installed."
fi
echo ""

# --- Docker Compose v2 ---
echo "[3/6] Installing Docker Compose v2..."
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

# --- nginx ---
echo "[4/6] Installing nginx..."
if command -v nginx &>/dev/null; then
  echo "  nginx is already installed, skipping."
else
  sudo apt-get install -y -qq nginx
  echo "  nginx installed."
fi
echo ""

# --- certbot + Cloudflare DNS plugin ---
echo "[5/6] Installing certbot and python3-certbot-dns-cloudflare..."
if command -v certbot &>/dev/null; then
  echo "  certbot is already installed, skipping."
else
  sudo apt-get install -y -qq certbot python3-certbot-dns-cloudflare
  echo "  certbot and python3-certbot-dns-cloudflare installed."
fi
echo ""

# --- ufw ---
echo "Installing and configuring ufw..."
if command -v ufw &>/dev/null; then
  echo "  ufw is already installed."
else
  sudo apt-get install -y -qq ufw
  echo "  ufw installed."
fi

# Allow SSH and web ports from VPN subnet.
sudo ufw allow proto tcp from 192.168.11.0/24 to any port 22
sudo ufw allow proto tcp from 192.168.11.0/24 to any port 80
sudo ufw allow proto tcp from 192.168.11.0/24 to any port 443
sudo ufw allow proto tcp from 192.168.11.0/24 to any port 3100

echo "  ufw rules configured."
echo ""

# --- certbot wildcard certificate ---
echo "[6/6] certbot wildcard certificate (*.cuneim.com)..."
echo "  The certbot certonly command for obtaining a Let's Encrypt"
echo "  wildcard certificate (*.cuneim.com) via Cloudflare DNS challenge."
echo ""
echo "  Prerequisites:"
echo "    1. Place Cloudflare API credentials at /root/.secrets/cloudflare.ini"
echo "       Format: dns_cloudflare_api_token = <your_api_token>"
echo "    2. Ensure the file is readable only by root: chmod 600 /root/.secrets/cloudflare.ini"
echo ""
echo "  Command (run manually after credentials are in place):"
echo "    certbot certonly \\"
echo "      --dns-cloudflare \\"
echo "      --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \\"
echo "      -d cuneim.com,*.cuneim.com \\"
echo "      --preferred-challenges dns-01 \\"
echo "      --dns-cloudflare-propagation-seconds 30"
echo ""
echo "  NOTE: This command is NOT auto-executed by this script."
echo "        Run it manually after placing credentials."
echo ""

# --- Directories ---
echo "Creating directory structure..."
mkdir -p ~/cuneim/agent/data
mkdir -p ~/cuneim/shared-logs
mkdir -p ~/cuneim/prisma
mkdir -p ~/cuneim/nginx
echo "  Directories created under ~/cuneim/: agent/data, shared-logs, prisma, nginx"
echo ""

# --- Firewall defaults ---
echo "Setting firewall defaults and enabling ufw..."
sudo ufw default deny incoming
sudo ufw --force enable
echo "  ufw enabled with default deny incoming."
echo ""

echo "=== Setup complete for ${SSH_HOST} ==="
REMOTE_EOF
