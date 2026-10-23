#!/bin/bash
# Disk + loop device cleanup — runs every 10 minutes via cron.
# Fixes: LOOP_USAGE never set, journal retention too aggressive,
#        loop device cleanup was never actually happening,
#        freed loop-image blocks were never returned to the host filesystem.

LOG_FILE="/var/log/disk_cleanup.log"
MAIN_THRESHOLD=70          # % main disk usage before cleanup triggers
LOOP_SOFT_THRESHOLD=60     # % loop usage before oldest cache entries are evicted
LOOP_HARD_THRESHOLD=80     # % loop usage before the complete bun cache is cleared
LOOP_TARGET_USAGE=$((LOOP_SOFT_THRESHOLD * 2 / 3))
ORPHAN_MIN_AGE_SECONDS=600
VICTORIAMETRICS_DATA_DIR="/var/lib/bundlephobia-victoriametrics"
VICTORIAMETRICS_CLEANUP_THRESHOLD_BYTES=$((160 * 1024 * 1024))
VICTORIAMETRICS_PM2_APP="bundlephobia-victoriametrics"

PM2="/usr/local/bin/pm2"
export HOME="/root"
export PM2_HOME="/root/.pm2"
export PATH="/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin"

log() {
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] $1" | tee -a "$LOG_FILE" 2>/dev/null || \
        echo "[$(date +"%Y-%m-%d %H:%M:%S")] $1"
}

get_disk_usage() {
    df / | awk 'NR==2 {gsub(/%/,"",$5); print $5}'
}

get_loop_usage() {
    # Returns integer percent usage of the /tmp/tmp-build loop device
    df /tmp/tmp-build 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}'
}

cleanup_orphaned_package_managers() {
    log "Scanning for orphaned package manager processes older than ${ORPHAN_MIN_AGE_SECONDS}s"

    local matches
    matches=$(ps -eo pid=,ppid=,etimes=,comm=,args= --no-headers | \
        awk -v min_age="$ORPHAN_MIN_AGE_SECONDS" \
        '$2 == 1 && $3 >= min_age && ($4 == "bun" || $4 == "npm" || $4 == "yarn" || $4 == "pnpm" || \
        ($4 == "sh" && $5 ~ /^(bun|npm|yarn|pnpm)$/)) \
        { print $1 "\t" $3 "\t" $4 "\t" substr($0, index($0,$5)) }')

    if [ -z "$matches" ]; then
        log "No orphaned package manager processes found"
        return
    fi

    while IFS=$'\t' read -r pid etimes comm cmd; do
        [ -n "$pid" ] || continue
        log "Killing orphaned process pid=$pid age=${etimes}s comm=$comm"
        kill -TERM "$pid" 2>/dev/null || true
    done <<< "$matches"

    sleep 2

    while IFS=$'\t' read -r pid etimes comm cmd; do
        [ -n "$pid" ] || continue
        if kill -0 "$pid" 2>/dev/null; then
            log "Force killing stubborn orphaned pid=$pid"
            kill -KILL "$pid" 2>/dev/null || true
        fi
    done <<< "$matches"
}

cleanup_stale_hidden_tmp_dirs() {
    log "Cleaning stale hidden directories under /tmp"
    find /tmp -maxdepth 1 -mindepth 1 -type d -name '.*' \
        ! -name '.X11-unix' ! -name '.ICE-unix' ! -name '.Test-unix' \
        ! -name '.font-unix' ! -name '.XIM-unix' ! -name '.X0-lock' \
        -mmin +60 -exec rm -rf {} + 2>/dev/null
    log "Cleaned stale hidden directories under /tmp"
}

cleanup_stale_package_dirs() {
    local stop_at_target="${1:-true}"
    local package_root="${BUILD_TMP_DIR:-/tmp/tmp-build}/packages"
    local entry path loop_usage

    [ -d "$package_root" ] || return

    while IFS= read -r -d '' entry; do
        if [ "$stop_at_target" = "true" ]; then
            loop_usage=$(get_loop_usage)
            [ "$loop_usage" -gt "$LOOP_TARGET_USAGE" ] || break
        fi

        path="${entry#* }"
        log "Removing stale package workspace (oldest first): ${path}"
        rm -rf -- "$path" 2>/dev/null
    done < <(
        find "$package_root" -mindepth 1 -maxdepth 1 -type d -mmin +60 \
            -printf '%T@ %p\0' 2>/dev/null | sort -z -n
    )
}

cleanup_npm_cache() {
    /usr/local/bin/npm cache clean --force --cache=/tmp/tmp-build/cache 2>/dev/null || true
    log "Cleared npm cache from loop device"
}

evict_oldest_bun_cache_entries() {
    local entry path loop_usage
    local evicted_count=0
    local first_path=""
    local last_path=""
    local batch_size=100
    local -a batch=()

    [ -d /tmp/tmp-build/cache/bun ] || return

    while IFS= read -r -d '' entry; do
        path="${entry#* }"
        [ -n "$first_path" ] || first_path="$path"
        last_path="$path"
        batch+=("$path")

        [ "${#batch[@]}" -ge "$batch_size" ] || continue

        rm -rf -- "${batch[@]}" 2>/dev/null
        evicted_count=$((evicted_count + ${#batch[@]}))
        batch=()

        loop_usage=$(get_loop_usage)
        [ "$loop_usage" -gt "$LOOP_TARGET_USAGE" ] || break
    done < <(
        find /tmp/tmp-build/cache/bun -mindepth 1 -maxdepth 1 -type d \
            ! -name '.tmp' -printf '%T@ %p\0' 2>/dev/null | sort -z -n
    )

    loop_usage=$(get_loop_usage)
    if [ "${#batch[@]}" -gt 0 ] && [ "$loop_usage" -gt "$LOOP_TARGET_USAGE" ]; then
        rm -rf -- "${batch[@]}" 2>/dev/null
        evicted_count=$((evicted_count + ${#batch[@]}))
    fi

    if [ "$evicted_count" -gt 0 ]; then
        log "Evicted ${evicted_count} oldest bun cache entries; first=${first_path}; last=${last_path}"
    fi
}

trim_loop_device() {
    local trim_output
    if trim_output=$(fstrim -v /tmp/tmp-build 2>&1); then
        log "Trimmed freed loop-image blocks: ${trim_output}"
    else
        log "WARNING: Could not trim freed loop-image blocks: ${trim_output}"
    fi
}

cleanup_victoriametrics_data() {
    local data_kib pid was_running=false

    [ -d "$VICTORIAMETRICS_DATA_DIR" ] || return 0

    data_kib=$(du -sk "$VICTORIAMETRICS_DATA_DIR" 2>/dev/null | awk 'NR==1 {print $1}')
    [[ "$data_kib" =~ ^[0-9]+$ ]] || { log "WARNING: Could not read VictoriaMetrics data size"; return; }
    if (( data_kib * 1024 <= VICTORIAMETRICS_CLEANUP_THRESHOLD_BYTES )); then
        return 0
    fi
    [ -x "$PM2" ] || { log "WARNING: PM2 is unavailable — skipping VictoriaMetrics cleanup"; return; }

    pid=$("$PM2" pid "$VICTORIAMETRICS_PM2_APP" 2>/dev/null | tail -n 1)
    [[ "$pid" =~ ^[0-9]+$ ]] || { log "WARNING: Could not read the VictoriaMetrics PM2 process"; return; }

    if [ "$pid" -gt 0 ]; then
        if ! "$PM2" stop "$VICTORIAMETRICS_PM2_APP" >/dev/null 2>&1; then
            log "WARNING: Could not stop VictoriaMetrics with PM2 — skipping cleanup"
            return
        fi
        was_running=true
    fi

    # The full reset is safe only while VictoriaMetrics is stopped.
    if ! find "$VICTORIAMETRICS_DATA_DIR" -mindepth 1 -maxdepth 1 \
        ! -name lost+found -exec rm -rf -- {} + 2>/dev/null; then
        log "WARNING: Could not clear VictoriaMetrics data; leaving the service stopped"
        return
    fi

    log "Reset VictoriaMetrics history after storage exceeded 160 MiB (${data_kib} KiB)"

    if [ "$was_running" = "true" ] && ! "$PM2" restart "$VICTORIAMETRICS_PM2_APP" >/dev/null 2>&1; then
        log "WARNING: VictoriaMetrics history was cleared but PM2 could not restart the service"
    fi
}

cleanup_loop_device() {
    local loop_usage
    loop_usage=$(get_loop_usage)

    if [ -z "$loop_usage" ]; then
        log "WARNING: Could not determine loop device usage — skipping loop cleanup"
        return
    fi

    log "Loop device (/tmp/tmp-build) usage: ${loop_usage}%"

    if [ "$loop_usage" -ge "$LOOP_HARD_THRESHOLD" ]; then
        log "Loop usage at or above hard threshold ${LOOP_HARD_THRESHOLD}% — running aggressive cleanup"
        cleanup_stale_package_dirs false
        cleanup_npm_cache

        if [ -d /tmp/tmp-build/cache/bun ]; then
            find /tmp/tmp-build/cache/bun -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + 2>/dev/null
            log "Cleared complete bun cache"
        fi

        trim_loop_device
        log "Loop usage after aggressive cleanup: $(get_loop_usage)%"
    elif [ "$loop_usage" -ge "$LOOP_SOFT_THRESHOLD" ]; then
        log "Loop usage at or above soft threshold ${LOOP_SOFT_THRESHOLD}% — running oldest-first cleanup to ${LOOP_TARGET_USAGE}%"
        cleanup_stale_package_dirs true

        loop_usage=$(get_loop_usage)
        if [ "$loop_usage" -gt "$LOOP_TARGET_USAGE" ]; then
            cleanup_npm_cache
        fi

        loop_usage=$(get_loop_usage)
        if [ "$loop_usage" -gt "$LOOP_TARGET_USAGE" ]; then
            evict_oldest_bun_cache_entries
        fi

        trim_loop_device
        loop_usage=$(get_loop_usage)
        log "Loop usage after oldest-first cleanup: ${loop_usage}%"
        if [ "$loop_usage" -gt "$LOOP_TARGET_USAGE" ]; then
            log "WARNING: Loop remains above cleanup target; no more top-level bun cache directories were available"
        fi
    fi
}

cleanup_main() {
    log "Starting main disk cleanup"

    cleanup_orphaned_package_managers
    cleanup_stale_hidden_tmp_dirs

    # Old log files (keep 7 days)
    find /var/log -type f -name "*.log" -mtime +7 \
        ! -name "disk_cleanup.log" ! -name "pm2_monitor.log" \
        -delete 2>/dev/null
    find /var/log -type f -name "*.gz" -mtime +30 -delete 2>/dev/null
    log "Cleared old log files (kept pm2_monitor.log + disk_cleanup.log)"

    # PM2 application logs (flush only, don't delete — logrotate handles rotation)
    if [ -x "$PM2" ]; then
        "$PM2" flush 2>/dev/null || true
        log "Flushed PM2 application logs"
    fi

    # Journal: keep 7 days of history for debugging
    journalctl --vacuum-time=7d 2>/dev/null
    log "Vacuumed journal (kept 7 days)"

    apt-get clean 2>/dev/null
    log "Cleared apt cache"

    log "Main disk cleanup completed"
}

main() {
    local usage
    usage=$(get_disk_usage)
    log "Main disk usage: ${usage}%   Loop device usage: $(get_loop_usage)%"

    # Always check loop device regardless of main disk
    cleanup_loop_device
    cleanup_victoriametrics_data

    if [ "$usage" -gt "$MAIN_THRESHOLD" ]; then
        log "Main disk above ${MAIN_THRESHOLD}% — running full cleanup"
        cleanup_main
        local new_usage
        new_usage=$(get_disk_usage)
        log "Main disk usage after cleanup: ${new_usage}%"
    else
        log "Main disk below threshold — no full cleanup needed"
    fi
}

# Allow the integration check to source the production functions without running
# host-wide housekeeping or acquiring the production lock.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    exec 9>/run/lock/disk-clean.lock
    if ! flock -n 9; then
        log "Another disk cleanup is already running — skipping"
        exit 0
    fi

    main
fi
