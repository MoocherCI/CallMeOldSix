#!/usr/bin/env bash
# Parse tag for environment, branch, and services.
# Called from deploy workflows. Outputs KEY=VALUE lines to stdout.
# Caller must eval the output, e.g.: eval "$(bash .github/scripts/parse-tag.sh)"
#
# Expected environment:
#   GITHUB_EVENT_NAME (set by GitHub Actions: "push" or "workflow_dispatch")
#   GITHUB_REF_NAME   (set by GitHub Actions on tag push)
#   INPUT_ENVIRONMENT (set by GitHub Actions on workflow_dispatch)
#   INPUT_VERSION     (set by GitHub Actions on workflow_dispatch)
#   INPUT_BRANCH      (set by GitHub Actions on workflow_dispatch)
#   INPUT_SERVICES    (set by GitHub Actions on workflow_dispatch)
#   INPUT_TARGET      (set by GitHub Actions on workflow_dispatch; optional)
set -euo pipefail

if [ "${GITHUB_EVENT_NAME:-}" = "workflow_dispatch" ]; then
  # --- Manual trigger: read from inputs ---
  DEPLOY_ENV="${INPUT_ENVIRONMENT:-}"
  VERSION="${INPUT_VERSION:-}"
  REPO_BRANCH="${INPUT_BRANCH:-}"
  SERVICES_INPUT="${INPUT_SERVICES:-}"

  # Auto-generate version if empty (handle empty string from API dispatch)
  VERSION=$(echo "$VERSION" | xargs)
  if [ -z "$VERSION" ]; then
    VERSION=$(date -u +'%Y%m%d%H%M%S')
  fi

  # Parse services
  BUILD_APP="false"
  BUILD_AGENT="false"
  BUILD_ADMIN="false"
  DISPLAY_PARTS=()

  if [ "$SERVICES_INPUT" = "all" ] || [ -z "$SERVICES_INPUT" ]; then
    BUILD_APP="true"
    BUILD_AGENT="true"
    BUILD_ADMIN="true"
    SERVICES_DISPLAY="app,agent,admin"
  else
    IFS='+' read -ra SVC_ARRAY <<< "$SERVICES_INPUT"
    for svc in "${SVC_ARRAY[@]}"; do
      case "$svc" in
        app)   BUILD_APP="true";   DISPLAY_PARTS+=("app") ;;
        agent) BUILD_AGENT="true"; DISPLAY_PARTS+=("agent") ;;
        admin) BUILD_ADMIN="true"; DISPLAY_PARTS+=("admin") ;;
      esac
    done
    SERVICES_DISPLAY=$(IFS=,; echo "${DISPLAY_PARTS[*]}")
  fi

  # Construct a synthetic tag name for display
  DEPLOY_TAG="${DEPLOY_ENV}-v${VERSION}"
  IMAGE_TAG="${DEPLOY_ENV}-v${VERSION}"

  # Parse deploy target from inputs
  DEPLOY_TARGET="${INPUT_TARGET:-}"
  [ -z "$DEPLOY_TARGET" ] && DEPLOY_TARGET="single"
else
  # --- Tag trigger: parse from github.ref_name (existing logic) ---
  TAG="${GITHUB_REF_NAME:-}"
  DEPLOY_ENV=""
  REMAINDER=""
  if [[ "$TAG" == dev-v* ]]; then
    DEPLOY_ENV="dev"
    REMAINDER="${TAG#dev-v}"
  elif [[ "$TAG" == test-v* ]]; then
    DEPLOY_ENV="test"
    REMAINDER="${TAG#test-v}"
  elif [[ "$TAG" == next-v* ]]; then
    DEPLOY_ENV="next"
    REMAINDER="${TAG#next-v}"
  elif [[ "$TAG" == prod-v* ]]; then
    DEPLOY_ENV="prod"
    REMAINDER="${TAG#prod-v}"
  fi
  if [ -z "$DEPLOY_ENV" ]; then
    echo "ERROR: Unrecognized tag format: '$TAG'" >&2
    echo "Expected: dev-v*, test-v*, next-v*, or prod-v*" >&2
    exit 1
  fi

  BUILD_APP="false"
  BUILD_AGENT="false"
  BUILD_ADMIN="false"
  REPO_BRANCH=""

  if [[ "$REMAINDER" == *+* ]]; then
    VERSION_PART="${REMAINDER%%+*}"
    SERVICES_AND_BRANCH="${REMAINDER#*+}"

    if [[ "$SERVICES_AND_BRANCH" == *-* ]]; then
      SERVICES_PART="${SERVICES_AND_BRANCH%%-*}"
      REPO_BRANCH="${SERVICES_AND_BRANCH#*-}"
    else
      SERVICES_PART="$SERVICES_AND_BRANCH"
    fi

    IFS='.' read -ra SVC_ARRAY <<< "$SERVICES_PART"
    DISPLAY_PARTS=()
    for svc in "${SVC_ARRAY[@]}"; do
      case "$svc" in
        app)   BUILD_APP="true";   DISPLAY_PARTS+=("app") ;;
        agent) BUILD_AGENT="true"; DISPLAY_PARTS+=("agent") ;;
        admin) BUILD_ADMIN="true"; DISPLAY_PARTS+=("admin") ;;
      esac
    done
    SERVICES_DISPLAY=$(IFS=,; echo "${DISPLAY_PARTS[*]}")
  else
    BUILD_APP="true"
    BUILD_AGENT="true"
    BUILD_ADMIN="true"
    SERVICES_DISPLAY="app,agent,admin"
  fi

  DEPLOY_TAG="$TAG"
  # IMAGE_TAG: strip +services portion from tag for Docker compatibility
  IMAGE_TAG=$(echo "$TAG" | sed 's/+[^-]*//' | sed 's/[^a-zA-Z0-9._-]/-/g')

  DEPLOY_TARGET="single"
fi

[ "$DEPLOY_ENV" = "next" ] && DEPLOY_TARGET="dual"

# Output KEY=VALUE lines to stdout for caller to eval
echo "DEPLOY_ENV=${DEPLOY_ENV}"
echo "REPO_BRANCH=${REPO_BRANCH}"
echo "BUILD_APP=${BUILD_APP}"
echo "BUILD_AGENT=${BUILD_AGENT}"
echo "BUILD_ADMIN=${BUILD_ADMIN}"
echo "SERVICES_DISPLAY=${SERVICES_DISPLAY}"
echo "IMAGE_TAG=${IMAGE_TAG}"
echo "DEPLOY_TAG=${DEPLOY_TAG}"
echo "DEPLOY_TARGET=${DEPLOY_TARGET}"
