# Bundlephobia Build Service Benchmarking & Profiling Harness

A dedicated Docker-based benchmarking, profiling, and diagnostics harness for Bundlephobia's `build-service` (`package-build-stats`).

Unlike the main service (which acts as an HTTP routing and caching proxy), the **build service is a compiler and process orchestrator**: it invokes package installers (`bun install` / `npm install`), performs disk writes and deletions in `/tmp`, and executes CPU- and memory-intensive V8 bundler pipelines (esbuild, rollup, webpack).

This harness is equipped with **both high-level V8 runtime profiling (CDP)** and **low-level Linux kernel diagnostic capabilities (`SYS_PTRACE`, `strace`, `/proc` smaps, context switch counters, child process tree tracking)**.

---

## Architecture Overview

```
                      +---------------------------------------+
                      |          Host / Orchestrator          |
                      |         ./run-build-bench.sh          |
                      +-------------------+-------------------+
                                          |
                +-------------------------+-------------------------+
                |                                                   |
                v                                                   v
     +--------------------+                               +-------------------+
     |  load-runner       |                               | bp-build-monitor  |
     | (Workload Replayer | -- HTTP GET /size, /exports ->| (V8 CDP Profiler  |
     |  Concurrency Queue)|                               |  Snapshots/Traces)|
     +--------------------+                               +---------+---------+
                                                                    |
                                                                    v
                                                          +-------------------+
                                                          |  bp-build-service |
                                                          | (Fastify + PBS    |
                                                          |  Node 24 + Bun)   |
                                                          |  + sys-monitor.sh |
                                                          +-------------------+
```

---

## What It Measures

### 1. High Memory Investigation

- **V8 Heap Snapshots (`.heapsnapshot`)**:
  - `baseline.heapsnapshot`: Captured at cold startup after initial GC.
  - `post-cooldown.heapsnapshot`: Captured after the workload finishes + cooldown + GC.
  - _How to analyze:_ Open Chrome DevTools > **Memory** tab > **Load** both snapshots > Select **Comparison** mode to see exactly which objects/constructors were not garbage-collected.
- **V8 Sampling Heap Allocation (`build-service-allocation.heapprofile`)**:
  - Continuous 16 KB interval sampling of memory allocations by JS call-site.
  - Shows which bundler modules, AST parsers, or serialization routines allocate memory.
- **Kernel Memory Breakdown (`system-timeline.jsonl`)**:
  - **PSS (Proportional Set Size)** and **Private_Dirty** via `/proc/$PID/smaps_rollup`.
  - **Anonymous RAM** (JS Heap + C++ Buffers) vs **File-backed RAM** (memory-mapped node_modules and bundles).
  - Shows C/C++ memory overhead (zlib buffers, jemalloc fragmentation) invisible in V8 snapshots.
- **Child Process Memory**:
  - Monitors the transient RSS and process count of child installer commands (`bun`, `npm`, `node`).

### 2. High CPU & Syscall Latency Investigation

- **V8 CPU Profile (`build-service-run.cpuprofile`)**:
  - 1 ms sampling of execution call-stacks across the entire benchmark run.
  - _How to analyze:_ Open in Chrome DevTools > **Performance** tab (or upload to [speedscope.app](https://www.speedscope.app/)) to see exact flamegraphs of CPU hotspots.
- **Syscall Analysis (`strace-tracer.sh`)**:
  - Runs with `SYS_PTRACE` privilege inside the container.
  - `strace -f -c`: Aggregates system call counts, error rates, and total execution time spent in kernel space (e.g. `futex`, `clone`, `stat`, `write`).
  - `strace -f -T -tt`: Tracks microsecond timestamps and duration of individual filesystem and IPC syscalls.
- **CPU Context Switches**:
  - Distinguishes user-space CPU ticks from kernel-space CPU ticks.
  - Tracks voluntary context switches (I/O wait) vs involuntary context switches (CPU saturation/preemption).

### 3. File Churn & Orphan Process Hygiene

- Tracks temporary directory storage (`/tmp/package-build-stats`) to verify that all installation artifacts and workspaces are deleted upon build completion.
- Tracks active file descriptors (`/proc/$PID/fd`) to detect FD leaks.
- Checks for orphaned child processes (e.g. stalled `npm install` processes) after callers disconnect.

---

## Quick Start

### 1. Run Baseline Benchmark (Single-Threaded Profiling)

Executes all 17 curated packages across tiers (micro, standard, heavy, multi-export, error) sequentially with full V8 profiling:

```bash
cd build-bench
./run-build-bench.sh
```

### 2. Run Concurrent Load Test

Tests the build service under parallel build pressure (e.g., concurrency 3, running 2 iterations):

```bash
# Format: ./run-build-bench.sh [CONCURRENCY] [ITERATIONS]
./run-build-bench.sh 3 2
```

### 3. Enable Low-Level Syscall Tracing (`strace`)

Captures kernel syscall distributions during the run:

```bash
RUN_STRACE=true ./run-build-bench.sh 1 1
```

---

## Curated Workload Tiers (`workload/packages.json`)

| Tier               | Sample Packages                                      | Endpoint                     | Primary Stress Factor                                             |
| ------------------ | ---------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| **Micro**          | `is-odd`, `clsx`, `ms`, `mime-types`                 | `/size`                      | Baseline harness overhead, Bun install latency, Fastify dispatch  |
| **Standard**       | `dayjs`, `chalk`, `axios`, `lodash`, `zod`           | `/size`                      | Typical production builds, AST generation, TS types               |
| **Heavy**          | `react`, `rxjs`, `@tanstack/react-query`, `date-fns` | `/size`                      | Heavy tree-shaking, bundler heap spikes, large export trees       |
| **Multi-Export**   | `lucide-react`, `lodash-es`                          | `/exports-sizes`, `/exports` | Parallel export bundle execution (600+ - 1000+ entries)           |
| **Error Handling** | 404 package, 404 version                             | `/size`                      | Error serialization, fast-fail handling, `/tmp` workspace cleanup |

---

## Generated Output Artifacts (`build-bench/results/`)

- **`build-timeline.jsonl`**: Detailed latency, status, gzip size, and raw size for every build.
- **`cdp-timeline.jsonl`**: Sub-second timeline of RSS, V8 Heap Used, Heap Total, External Buffers, and Libuv handles.
- **`system-timeline.jsonl`**: Kernel-level memory (PSS, Anon, Private Dirty), CPU ticks, context switches, child processes, and `/tmp` bytes.
- **`build-service-run.cpuprofile`**: V8 CPU flamegraph loadable in Chrome DevTools or Speedscope.
- **`build-service-allocation.heapprofile`**: V8 Heap allocation call tree.
- **`baseline.heapsnapshot`**: V8 heap before any builds.
- **`post-cooldown.heapsnapshot`**: V8 heap after workload and GC.
- **`reports/benchmark-report.md`**: Markdown summary containing latency percentiles, tier breakdown, memory delta, and slowest package analysis.
