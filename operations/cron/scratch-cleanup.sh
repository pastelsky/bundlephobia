# Source immediately before main in /var/www/disk-clean.sh. The existing job
# retains its lock, root-filesystem housekeeping and log destination.
cleanup_loop_device() {
    if ! node /var/www/bundlephobia/operations/cleanup-scratch.mjs \
        --root "${BUILD_TMP_DIR:-/tmp/tmp-build}" >> "$LOG_FILE" 2>&1; then
        log "WARNING: Scratch cleanup failed; inspect unmanaged paths and cleanup errors"
        return 1
    fi
    trim_loop_device
}
