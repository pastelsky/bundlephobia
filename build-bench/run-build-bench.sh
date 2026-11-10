#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$DIR/docker-compose.build-bench.yml"
RESULTS_DIR="$DIR/results"

mkdir -p "$RESULTS_DIR/diagnostics" "$RESULTS_DIR/reports"

CONCURRENCY="${1:-1}"
ITERATIONS="${2:-1}"
RUN_STRACE="${RUN_STRACE:-false}"

export CONCURRENCY
export ITERATIONS

echo "================================================================="
echo "       Bundlephobia Build Service Benchmarking & Profiler        "
echo "================================================================="
echo "Configuration:"
echo "  - Concurrency:       $CONCURRENCY"
echo "  - Workload Iterations: $ITERATIONS"
echo "  - Low-level Strace:  $RUN_STRACE"
echo "  - Results Directory: $RESULTS_DIR"
echo "-----------------------------------------------------------------"

cleanup() {
  echo ""
  echo "[cleanup] Shutting down benchmark containers..."
  docker compose -f "$COMPOSE_FILE" stop bp-build-monitor || true
  docker compose -f "$COMPOSE_FILE" down || true
  echo "[cleanup] Done."
}
trap cleanup EXIT INT TERM

echo "[1/6] Building & launching bp-build-service container..."
docker compose -f "$COMPOSE_FILE" up -d --build bp-build-service

echo "[2/6] Waiting for build-service to become ready on http://localhost:7002/..."
for i in {1..60}; do
  if curl -sf "http://localhost:7002/size?p=is-odd%403.0.1" > /dev/null 2>&1; then
    echo "  -> build-service is online and responsive!"
    break
  fi
  sleep 1
  if [ "$i" -eq 60 ]; then
    echo "Error: Timed out waiting for build-service. Container logs:"
    docker compose -f "$COMPOSE_FILE" logs bp-build-service
    exit 1
  fi
done

echo "[3/6] Starting background kernel and OS metrics monitor (sys-monitor.sh)..."
docker exec -d bp-build-service /app/build-bench/monitor/sys-monitor.sh

echo "[4/6] Connecting V8 CDP profiler & memory tracker (taking baseline heap snapshot)..."
docker compose -f "$COMPOSE_FILE" up -d bp-build-monitor
# Give CDP monitor 3 seconds to take baseline snapshot and start profilers
sleep 3

if [ "$RUN_STRACE" = "true" ]; then
  echo "[optional] Starting strace syscall aggregate tracing in background..."
  docker exec -d bp-build-service /app/build-bench/monitor/strace-tracer.sh summary 30
fi

echo "[5/6] Executing package build workload (concurrency: $CONCURRENCY)..."
node "$DIR/load-runner/runner.mjs"

echo ""
echo "[6/6] Workload finished! Waiting 5s cooldown to observe memory reclamation..."
sleep 5

echo "Stopping CDP monitor and capturing post-cooldown heap snapshot..."
docker kill --signal=SIGINT bp-build-monitor || true
sleep 4
docker compose -f "$COMPOSE_FILE" stop bp-build-monitor || true

# Stop sys-monitor
docker exec bp-build-service pkill -SIGINT -f "sys-monitor.sh" || true
sleep 1

echo ""
echo "================================================================="
echo "                Generating Analysis Report                       "
echo "================================================================="
node "$DIR/analyze-results.mjs"
