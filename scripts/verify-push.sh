#!/bin/bash
# Verify the 22-commit fast-forward push to origin/main was successful.
# Run after pushing local commits to origin/main.
set -euo pipefail

echo "=== Verifying push to origin/main ==="

# 1. Fetch latest from origin
git fetch origin main

# 2. Check origin/main matches local HEAD
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" = "$REMOTE" ]; then
  echo "PASS: origin/main matches local HEAD ($LOCAL)"
else
  echo "FAIL: origin/main ($REMOTE) != local HEAD ($LOCAL)"
  exit 1
fi

# 3. Check no commits ahead
AHEAD=$(git rev-list --count origin/main..HEAD)
if [ "$AHEAD" -eq 0 ]; then
  echo "PASS: 0 commits ahead of origin/main"
else
  echo "FAIL: $AHEAD commits ahead of origin/main"
  exit 1
fi

# 4. Verify deploy.yml on origin/main contains target input
if git show origin/main:.github/workflows/deploy.yml | grep -q 'target:'; then
  echo "PASS: target input found in origin/main deploy.yml"
else
  echo "FAIL: target input not found in origin/main deploy.yml"
  exit 1
fi

echo "=== All push verification checks passed ==="
