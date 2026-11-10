#!/usr/bin/env bash
set -e

MODE="${1:-summary}"
DURATION="${2:-15}"
RESULTS_DIR="${RESULTS_DIR:-/app/results}"
mkdir -p "$RESULTS_DIR"

TARGET_PID=$(pgrep -f "build-service/index.js" | head -n 1 || true)
if [ -z "$TARGET_PID" ]; then
  echo "[strace-tracer] Error: build-service PID not found."
  exit 1
fi

echo "[strace-tracer] Attaching strace to PID $TARGET_PID (mode=$MODE, duration=${DURATION}s)..."

if [ "$MODE" = "summary" ]; then
  OUTPUT_FILE="$RESULTS_DIR/strace-summary.txt"
  echo "[strace-tracer] Collecting syscall aggregate summary (strace -c)..."
  # strace -c collects counts, errors, and syscall times across all threads and child forks
  timeout "${DURATION}s" strace -f -c -p "$TARGET_PID" -o "$OUTPUT_FILE" 2>/dev/null || true
  echo "[strace-tracer] Syscall summary saved to $OUTPUT_FILE:"
  cat "$OUTPUT_FILE"
elif [ "$MODE" = "latency" ]; then
  OUTPUT_FILE="$RESULTS_DIR/strace-trace.log"
  echo "[strace-tracer] Capturing timestamped syscall trace with durations (strace -T -tt)..."
  # -T records time spent in each syscall, -tt gives microsecond timestamps
  timeout "${DURATION}s" strace -f -T -tt -e trace=process,file,desc,network -p "$TARGET_PID" -o "$OUTPUT_FILE" 2>/dev/null || true
  echo "[strace-tracer] Syscall trace saved to $OUTPUT_FILE ($(wc -l < "$OUTPUT_FILE") lines)."
fi
