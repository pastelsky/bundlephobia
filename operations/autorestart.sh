#!/bin/bash
# PM2 watchdog — runs every minute via cron
# Checks all required services, restarts PM2 if any are down.
# Hardened: log failures never abort the script; PM2 path is explicit.

# ── Configuration ────────────────────────────────────────────────────────────
PM2="/usr/local/bin/pm2"          # Symlink → nvm v24 pm2 (set during sysadmin fix)
NODE="/usr/local/bin/node"
LOG_FILE="/var/log/pm2_monitor.log"
PM2_WORKING_DIR="/var/www/bundlephobia"
PROCESS_FILE="process.yml"
REQUIRED_SERVICES=("build-service" "cache-service" "installation-service" "main")

export HOME="/root"
export PM2_HOME="/root/.pm2"
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin"

# ── Logging ──────────────────────────────────────────────────────────────────
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    # Write to log file; if disk is full, fall back to stderr only — never abort
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
    echo "$msg" >&2
}

# ── Sanity checks ────────────────────────────────────────────────────────────
preflight() {
    if [ ! -x "$PM2" ]; then
        log "FATAL: PM2 not found at $PM2 — check symlink /usr/local/bin/pm2"
        exit 1
    fi

    if [ ! -x "$NODE" ]; then
        log "FATAL: node not found at $NODE"
        exit 1
    fi

    if [ ! -d "$PM2_WORKING_DIR" ]; then
        log "FATAL: working dir $PM2_WORKING_DIR missing"
        exit 1
    fi
}

# ── Check PM2 daemon is alive ─────────────────────────────────────────────────
ensure_daemon() {
    if ! "$PM2" pid >/dev/null 2>&1; then
        log "PM2 daemon not running — attempting resurrect"
        "$PM2" resurrect 2>/dev/null || true
        sleep 3
    fi
}

# ── Check each required service ───────────────────────────────────────────────
check_services() {
    local failed=0
    local jlist
    jlist=$("$PM2" jlist 2>/dev/null) || { log "ERROR: pm2 jlist failed"; return 1; }

    for service in "${REQUIRED_SERVICES[@]}"; do
        local status
        status=$(echo "$jlist" | \
            python3 -c "
import sys, json
data = json.load(sys.stdin)
match = [p for p in data if p.get('name') == '$service']
print(match[0]['pm2_env']['status'] if match else 'missing')
" 2>/dev/null || echo "error")

        if [ "$status" = "online" ]; then
            : # healthy — stay silent
        else
            log "WARN: $service status=$status"
            failed=1
        fi
    done
    return $failed
}

# ── Full restart sequence ─────────────────────────────────────────────────────
restart_all() {
    log "Starting full PM2 restart sequence"

    # Graceful kill
    "$PM2" kill 2>/dev/null || true
    sleep 3

    # Force-kill any surviving node/pm2 processes (but NOT this script's bash)
    pkill -9 -f "PM2" 2>/dev/null || true
    sleep 1

    # Start fresh from process file
    cd "$PM2_WORKING_DIR" || { log "ERROR: cannot cd to $PM2_WORKING_DIR"; return 1; }

    if [ ! -f "$PROCESS_FILE" ]; then
        log "ERROR: $PROCESS_FILE not found in $PM2_WORKING_DIR"
        return 1
    fi

    # Restore the saved list, including optional collectors, before falling back
    # to the required application config on an empty or incomplete dump.
    "$PM2" resurrect 2>/dev/null || true
    if ! check_services; then
        "$PM2" startOrReload "$PROCESS_FILE" --env production
    fi
    sleep 5
    "$PM2" save

    if check_services; then
        log "Restart sequence completed — all services online"
    else
        log "ERROR: services still unhealthy after restart"
        return 1
    fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
    mkdir -p "$(dirname "$LOG_FILE")"

    preflight
    ensure_daemon

    cd "$PM2_WORKING_DIR" 2>/dev/null || true

    if check_services; then
        # Silent when healthy — avoids log spam
        exit 0
    fi

    # PM2 may spend 20 seconds gracefully stopping an installer during a reload.
    sleep 25
    if check_services; then
        exit 0
    fi

    log "=== Service check failed — initiating restart ==="
    log "Node: $($NODE --version 2>/dev/null)"
    log "PM2:  $($PM2 --version 2>/dev/null)"

    if restart_all; then
        log "=== Recovery complete ==="
    else
        log "=== Recovery FAILED — manual intervention required ==="
        exit 1
    fi
}

# Deployments can hold this same lock while restarting services.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    exec 9>/run/lock/bundlephobia-maintenance.lock
    flock -n 9 || exit 0
    main
fi
