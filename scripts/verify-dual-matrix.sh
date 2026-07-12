#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PARSER="$ROOT_DIR/.github/scripts/parse-tag.sh"

check_case() {
  local services="$1"
  local expected_app="$2"
  local expected_agent="$3"
  local expected_admin="$4"
  local output

  output=$(
    GITHUB_EVENT_NAME=workflow_dispatch \
    INPUT_ENVIRONMENT=next \
    INPUT_VERSION=matrix-check \
    INPUT_SERVICES="$services" \
    INPUT_BRANCH=refactor-marketing-redesign \
    bash "$PARSER"
  )

  grep -qx "BUILD_APP=$expected_app" <<<"$output"
  grep -qx "BUILD_AGENT=$expected_agent" <<<"$output"
  grep -qx "BUILD_ADMIN=$expected_admin" <<<"$output"
  grep -qx "DEPLOY_TARGET=dual" <<<"$output"
  printf 'OK %-12s app=%s agent=%s admin=%s\n' \
    "$services" "$expected_app" "$expected_agent" "$expected_admin"
}

check_case app true false false
check_case agent false true false
check_case admin false false true
check_case app+agent true true false
check_case app+admin true false true
check_case agent+admin false true true
check_case all true true true
