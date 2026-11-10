#!/usr/bin/env bash
set -u

RESULTS_DIR="${RESULTS_DIR:-/app/results}"
OUTPUT_FILE="$RESULTS_DIR/system-timeline.jsonl"
mkdir -p "$RESULTS_DIR"

echo "[sys-monitor] Starting low-level system & kernel monitor..."

# Find the Node.js build-service process PID
find_target_pid() {
  pgrep -f "build-service/index.js" | head -n 1
}

TARGET_PID=""
for i in {1..30}; do
  TARGET_PID=$(find_target_pid || true)
  if [ -n "$TARGET_PID" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TARGET_PID" ]; then
  echo "[sys-monitor] Warning: Could not locate build-service process PID. Will keep retrying."
fi

echo "[sys-monitor] Monitoring target PID: ${TARGET_PID:-pending}"
echo "[sys-monitor] Streaming metrics to $OUTPUT_FILE"

RUNNING=true
trap 'RUNNING=false' SIGINT SIGTERM

prev_vol_ctx=0
prev_invol_ctx=0
prev_utime=0
prev_stime=0
prev_time=0

while $RUNNING; do
  now_iso=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
  epoch_now=$(date +%s%N 2>/dev/null || date +%s)

  if [ -z "$TARGET_PID" ] || ! [ -d "/proc/$TARGET_PID" ]; then
    TARGET_PID=$(find_target_pid || true)
  fi

  if [ -n "$TARGET_PID" ] && [ -d "/proc/$TARGET_PID" ]; then
    # 1. Memory from /proc/$PID/status & smaps_rollup
    rss_kb=0
    pss_kb=0
    private_dirty_kb=0
    anon_kb=0
    swap_kb=0

    if [ -f "/proc/$TARGET_PID/smaps_rollup" ]; then
      while IFS=': ' read -r key val unit; do
        case "$key" in
          Rss) rss_kb="${val:-0}" ;;
          Pss) pss_kb="${val:-0}" ;;
          Private_Dirty) private_dirty_kb="${val:-0}" ;;
          Anonymous) anon_kb="${val:-0}" ;;
          Swap) swap_kb="${val:-0}" ;;
        esac
      done < "/proc/$TARGET_PID/smaps_rollup" 2>/dev/null || true
    elif [ -f "/proc/$TARGET_PID/status" ]; then
      rss_kb=$(grep -i "VmRSS" "/proc/$TARGET_PID/status" | awk '{print $2}' || echo 0)
      swap_kb=$(grep -i "VmSwap" "/proc/$TARGET_PID/status" | awk '{print $2}' || echo 0)
    fi

    # 2. File Descriptors count
    fd_count=$(ls -1 "/proc/$TARGET_PID/fd" 2>/dev/null | wc -l || echo 0)

    # 3. Context switches
    vol_ctx=$(grep "voluntary_ctxt_switches" "/proc/$TARGET_PID/status" 2>/dev/null | head -n 1 | awk '{print $2}' || echo 0)
    invol_ctx=$(grep "nonvoluntary_ctxt_switches" "/proc/$TARGET_PID/status" 2>/dev/null | head -n 1 | awk '{print $2}' || echo 0)

    delta_vol=0
    delta_invol=0
    if [ "$prev_vol_ctx" -gt 0 ]; then
      delta_vol=$((vol_ctx - prev_vol_ctx))
      delta_invol=$((invol_ctx - prev_invol_ctx))
    fi
    prev_vol_ctx=$vol_ctx
    prev_invol_ctx=$invol_ctx

    # 4. CPU usage from /proc/$PID/stat (ticks)
    stat_line=$(cat "/proc/$TARGET_PID/stat" 2>/dev/null || echo "")
    utime=0
    stime=0
    if [ -n "$stat_line" ]; then
      utime=$(echo "$stat_line" | awk '{print $14}')
      stime=$(echo "$stat_line" | awk '{print $15}')
    fi

    delta_utime=0
    delta_stime=0
    if [ "$prev_utime" -gt 0 ]; then
      delta_utime=$((utime - prev_utime))
      delta_stime=$((stime - prev_stime))
    fi
    prev_utime=$utime
    prev_stime=$stime

    # 5. Child processes (bun, npm, esbuild, node)
    child_count=0
    child_rss_kb=0
    child_summary="[]"
    
    # Get all descendant pids
    children_pids=$(pgrep -P "$TARGET_PID" 2>/dev/null || true)
    if [ -n "$children_pids" ]; then
      child_count=$(echo "$children_pids" | wc -w)
      # Sum RSS of children
      for cpid in $children_pids; do
        if [ -f "/proc/$cpid/status" ]; then
          crss=$(grep -i "VmRSS" "/proc/$cpid/status" | awk '{print $2}' || echo 0)
          child_rss_kb=$((child_rss_kb + crss))
        fi
      done
    fi

    # 6. /tmp disk usage
    tmp_bytes=$(du -sb /tmp/package-build-stats 2>/dev/null | awk '{print $1}' || echo 0)
    if [ -z "$tmp_bytes" ]; then
      tmp_bytes=0
    fi

    # Write JSON record
    cat <<EOF >> "$OUTPUT_FILE"
{"timestamp":"$now_iso","pid":$TARGET_PID,"rssKb":$rss_kb,"pssKb":$pss_kb,"privateDirtyKb":$private_dirty_kb,"anonymousKb":$anon_kb,"swapKb":$swap_kb,"fdCount":$fd_count,"ctxSwitches":{"voluntary":$delta_vol,"involuntary":$delta_invol},"cpuTicks":{"user":$delta_utime,"system":$delta_stime},"children":{"count":$child_count,"totalRssKb":$child_rss_kb},"tmpScratchBytes":$tmp_bytes}
EOF
  fi

  sleep 1
done

echo "[sys-monitor] Stopped."
