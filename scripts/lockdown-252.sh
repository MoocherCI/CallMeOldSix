#!/usr/bin/env bash
# Apply DOCKER-USER lockdown on 252 (data host).
# Allow all inbound from 251 (ingress host): cross-host nginx->app/admin,
# and app->postgres(5432)/redis(6379) traffic.
# Block everyone else from reaching 3000/3001/3006/3100/5432/6379.
# Container-to-container traffic (bridge/veth) is NOT affected (-i enp1s0 only).
set -euo pipefail

IFACE=enp1s0
ALLOW_SRC=91.110.182.251
PORTS="3000 3001 3006 3100 5432 6379"

# 1) allow all inbound from the ingress host (must be first in chain)
iptables -C DOCKER-USER -s "$ALLOW_SRC" -j ACCEPT 2>/dev/null || \
  iptables -I DOCKER-USER -s "$ALLOW_SRC" -j ACCEPT
echo "allowed: $ALLOW_SRC"

# 2) drop public access to service ports
for p in $PORTS; do
  iptables -C DOCKER-USER -i "$IFACE" -p tcp --dport "$p" -j DROP 2>/dev/null || \
    iptables -A DOCKER-USER -i "$IFACE" -p tcp --dport "$p" -j DROP
  echo "locked: $p"
done
