#!/usr/bin/env bash
# Apply DOCKER-USER lockdown on 251 (ingress host).
# Public internet may only reach 80/443 (nginx, via Cloudflare).
# Block public access to app/agent ports 3000-3007, 3100.
# Container-to-container traffic (bridge/veth) is NOT affected (-i enp1s0 only).
set -euo pipefail

IFACE=enp1s0
PORTS="3000 3001 3002 3003 3004 3005 3006 3007 3100"

for p in $PORTS; do
  iptables -C DOCKER-USER -i "$IFACE" -p tcp --dport "$p" -j DROP 2>/dev/null || \
    iptables -A DOCKER-USER -i "$IFACE" -p tcp --dport "$p" -j DROP
  echo "locked: $p"
done
