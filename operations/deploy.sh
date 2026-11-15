#!/usr/bin/env bash
# Zero-downtime deployment script for Bundlephobia.
#
# Performs immutable dependency installation, production asset compilation,
# HAProxy configuration sync & hitless reload, and graceful PM2 rolling reload
# without dropping active connections.
#
# Usage:
#   ./operations/deploy.sh [OPTIONS]
#
# Options:
#   --skip-pull    Skip `git pull --ff-only`
#   --skip-build   Skip `corepack yarn build` (asset compilation)
#   --branch <b >  Target git branch (default: bundlephobia)
#   --help, -h     Show this help message

set -euo pipefail

# ── Paths & Defaults ─────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BRANCH="bundlephobia"
SKIP_PULL=false
SKIP_BUILD=false

PM2="${PM2:-pm2}"
REQUIRED_SERVICES=("main" "build-service" "cache-service" "installation-service")

# ── Parse Arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pull)
      SKIP_PULL=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --help|-h)
      sed -n '2,15p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# ── Logging ──────────────────────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

# ── Preflight Checks ─────────────────────────────────────────────────────────
cd "${REPO_ROOT}"

log "Starting zero-downtime deployment in ${REPO_ROOT}..."

if ! command -v git >/dev/null 2>&1; then
  error "git is required but not installed."
  exit 1
fi

if ! command -v corepack >/dev/null 2>&1; then
  error "corepack is required but not installed."
  exit 1
fi

if ! command -v "${PM2}" >/dev/null 2>&1; then
  if [ -x "/usr/local/bin/pm2" ]; then
    PM2="/usr/local/bin/pm2"
  else
    error "PM2 executable not found."
    exit 1
  fi
fi

# ── Step 1: Git Status & Fast-Forward ────────────────────────────────────────
if [ "${SKIP_PULL}" = false ]; then
  log "Checking git status..."
  if ! git diff-index --quiet HEAD --; then
    error "Working directory has uncommitted tracked changes. Aborting."
    git status --short
    exit 1
  fi

  log "Pulling latest changes from origin/${BRANCH}..."
  git pull --ff-only origin "${BRANCH}"
else
  log "Skipping git pull (--skip-pull specified)."
fi

CURRENT_COMMIT="$(git rev-parse HEAD)"
log "Target commit: ${CURRENT_COMMIT}"

# ── Step 2: Install Dependencies ─────────────────────────────────────────────
log "Installing root dependencies (immutable)..."
corepack yarn install --immutable

log "Installing build-service dependencies (immutable)..."
(cd build-service && corepack yarn install --immutable)

if command -v bun >/dev/null 2>&1; then
  log "Upgrading Bun..."
  bun upgrade || log "WARN: bun upgrade failed or already latest, continuing."
fi

# ── Step 3: Production Asset Compilation (Pre-Reload) ────────────────────────
# CRITICAL FOR ZERO DOWNTIME:
# Asset compilation MUST succeed before reloading any services. If Next.js or
# dependencies fail to build, aborting here keeps active processes serving traffic.
if [ "${SKIP_BUILD}" = false ]; then
  log "Compiling production assets (yarn build)..."
  NODE_ENV=production corepack yarn build
else
  log "Skipping asset compilation (--skip-build specified)."
fi

# ── Step 4: HAProxy Configuration Sync & Hitless Reload ──────────────────────
if [ -d "/etc/haproxy" ] && command -v haproxy >/dev/null 2>&1; then
  HAPROXY_CHANGED=false
  SOURCE_CFG="${REPO_ROOT}/operations/haproxy/conf.d/30-traffic-policy.cfg"
  TARGET_CFG="/etc/haproxy/conf.d/30-traffic-policy.cfg"

  if [ -f "${SOURCE_CFG}" ] && [ -d "/etc/haproxy/conf.d" ]; then
    if ! cmp -s "${SOURCE_CFG}" "${TARGET_CFG}" 2>/dev/null; then
      log "Detected HAProxy configuration changes. Validating..."
      BACKUP_CFG="$(mktemp)"
      if [ -f "${TARGET_CFG}" ]; then
        cp "${TARGET_CFG}" "${BACKUP_CFG}"
      fi

      sudo cp "${SOURCE_CFG}" "${TARGET_CFG}"

      if sudo /usr/sbin/haproxy -c -f /etc/haproxy/haproxy.cfg -f /etc/haproxy/conf.d >/dev/null 2>&1; then
        log "HAProxy config valid. Reloading HAProxy hitlessly..."
        sudo systemctl reload haproxy
        HAPROXY_CHANGED=true
      else
        error "HAProxy config validation failed! Restoring previous configuration."
        if [ -s "${BACKUP_CFG}" ]; then
          sudo cp "${BACKUP_CFG}" "${TARGET_CFG}"
        fi
        rm -f "${BACKUP_CFG}"
        exit 1
      fi
      rm -f "${BACKUP_CFG}"
    fi
  fi

  if [ "${HAPROXY_CHANGED}" = false ]; then
    log "HAProxy configuration is up to date."
  fi
fi

# ── Step 5: Graceful Zero-Downtime Application Reload ────────────────────────
log "Reloading PM2 applications with --update-env (rolling zero-downtime)..."
"${PM2}" reload all --update-env

log "Saving PM2 process list..."
"${PM2}" save

# ── Step 6: Post-Deployment Verification & Health Checks ─────────────────────
log "Verifying process and service health..."
sleep 3

# Check PM2 statuses
PM2_JSON="$("${PM2}" jlist)"
for svc in "${REQUIRED_SERVICES[@]}"; do
  STATUS="$(echo "${PM2_JSON}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
matches = [p for p in data if p.get('name') == '${svc}']
if not matches:
    print('missing')
elif all(p['pm2_env']['status'] == 'online' for p in matches):
    print('online')
else:
    print('unhealthy')
" 2>/dev/null || echo "error")"

  if [ "${STATUS}" != "online" ]; then
    error "Service '${svc}' is not online (status=${STATUS})!"
    exit 1
  fi
  log "Service '${svc}' is online."
done

# Check direct application loopback port
log "Probing application port 5400..."
if ! curl -fsS -o /dev/null -m 5 "http://127.0.0.1:5400/"; then
  error "Loopback probe on http://127.0.0.1:5400/ failed!"
  exit 1
fi

# Check HAProxy frontend if running on server
if [ -d "/etc/haproxy" ]; then
  log "Probing HAProxy frontend..."
  if ! curl -fsS -o /dev/null -m 5 "http://127.0.0.1/"; then
    error "HAProxy loopback probe on http://127.0.0.1/ failed!"
    exit 1
  fi

  log "Probing API size endpoint..."
  API_RES="$(curl -fsS -m 10 "http://127.0.0.1/api/size?package=lodash@4.17.21" 2>/dev/null || true)"
  if [[ "${API_RES}" != *"\"name\":\"lodash\""* ]]; then
    error "API size probe failed or returned unexpected payload!"
    exit 1
  fi
fi

# ── Step 7: Summary ──────────────────────────────────────────────────────────
log "Deployment completed successfully with ZERO downtime!"
echo "──────────────────────────────────────────────────────────────────────────────"
echo "Deployed Commit: ${CURRENT_COMMIT}"
if command -v bun >/dev/null 2>&1; then
  echo "Bun Version:     $(bun --version)"
fi
echo "Root PBS:        $(node -p 'require("./package.json").dependencies["package-build-stats"]')"
echo "Build PBS:       $(node -p 'require("./build-service/package.json").dependencies["package-build-stats"]')"
echo "──────────────────────────────────────────────────────────────────────────────"
"${PM2}" list
