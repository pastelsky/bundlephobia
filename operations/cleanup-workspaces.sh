# Sourced by /var/www/disk-clean.sh before main. This is its existing workspace
# cleanup function, shared with the integration check rather than duplicated.
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
