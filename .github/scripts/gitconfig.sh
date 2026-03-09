#!/usr/bin/env bash
set -euo pipefail

mkdir -p ~/.ssh

echo "${ED25519_KEY}" > ~/.ssh/id_ed25519
chmod 600 ~/.ssh/id_ed25519

ssh-keygen -y -f ~/.ssh/id_ed25519 > ~/.ssh/id_ed25519.pub

ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null
