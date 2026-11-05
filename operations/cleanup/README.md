# Cleanup scheduling and scratch storage

## Adaptive priority

`operations/disk-clean.sh` runs every ten minutes, with one flock-protected
worker and a small supervisor. Every five seconds the supervisor takes the
maximum of root disk usage, scratch pressure (bytes or inodes), and normalized
one-minute load. Normalized load is `100 * load1 / CPU count`; it is not CPU
utilization. On four cores, load 3.2 is 80%, load 3.6 is 90%, and load can exceed
100%. Both runnable work and uninterruptible I/O can contribute to load.

| Pressure | CPU scheduling | Nice | I/O scheduling |
| --- | --- | --- | --- |
| Below 80%, initially | SCHED_IDLE | 19 | Idle |
| At least 80% | SCHED_OTHER | 10 | Best effort, 6 |
| At least 90% | SCHED_OTHER | 0 | Best effort, 4 |

Urgent priority persists until pressure falls below 85%; elevated priority
persists until it falls below 75%. Missing pressure readings select urgent
priority rather than silently starving recovery. Priority never becomes real
time or higher than the normal serving-process CPU priority. I/O priorities
are requests to the host scheduler, not a throughput guarantee.

The supervisor stays normally schedulable so it can promote an idle worker
under load. It updates existing descendant processes and their Linux threads,
including long-running rm/find/sort/Bun commands. Newly created tasks inherit
their parent's priority, with a refresh every five seconds. The worker and its
children retain the maintenance lock; overlapping cron attempts still skip.
SIGINT/SIGTERM terminate the worker tree. Priority failures for live tasks are
logged. Cron still starts every ten minutes; this change does not reduce the
worst-case delay before the first run begins.

Phase logs include elapsed seconds, return status, and root/scratch usage for
Bun age pruning, stale workspaces, npm cache, incremental eviction, full cache
reset, trimming, and the overall run. Existing helper functions may suppress
individual deletion errors: a successful phase return alone is not proof that
every path was removed. No performance gain is claimed before a measured rollout.

## Why runs exceeded ten minutes

Retained production logs (all times IST) show:

- Nov 3, 03:30:01–03:56:46: 26m45s overall. The incremental Bun eviction phase
  from 03:30:32 to 03:49:21 took 18m49s and reported 39,155 top-level entries.
  The complete-cache fallback reported completion another 6m22s later, followed
  by 60s until trimming completed.
- Nov 3: 45 of 95 completed runs exceeded ten minutes; longest 26m45s.
- Nov 4: 15 of 126 completed runs exceeded ten minutes; longest 24m30s.

The old script gave all work SCHED_IDLE and idle I/O priority. The eviction phase
includes directory enumeration, sorting, recursive deletion in 100-entry batches,
and repeated filesystem checks. One entry may contain many files. Installers
continued creating data while cleanup ran. Logs locate the long phases, but do
not separately measure scheduler wait, disk latency, or scan versus unlink time.
Priority changes address starvation risk; admission control is still needed to
prevent ongoing installation writes from outrunning reclamation.

## Scratch, root disk, and trimming are separate layers

Production uses this arrangement (verified Nov 5, 2026):

```text
Root filesystem (/dev/vda1)
  /var/tmp-build.img          25 GiB logical capacity, variable allocated blocks
    /dev/loop5               file exposed as a block device
      ext4 mounted at /tmp/tmp-build
        packages/            build workspaces
        installations/       shared installed packages, managed with leases
        cache/               package-manager downloads
```

The image is not a separate physical disk. Its allocated blocks consume space
on `/`. Its 25 GiB logical size remains fixed even when physical allocation falls.

Deleting files makes blocks available inside scratch, visible in
`df /tmp/tmp-build`. It does not necessarily release the backing file's blocks
on `/`. The mounted scratch filesystem currently has no continuous `discard`
option. `fstrim /tmp/tmp-build` reports unused scratch extents to the loop device;
on this discard-capable setup those extents can be hole-punched out of the
backing image so root space is reusable. It neither deletes live files nor
changes the image's logical capacity.

These measurements answer different questions:

- `df /tmp/tmp-build`: space available for package files inside scratch.
- `df -i /tmp/tmp-build`: free inodes; small files can exhaust these first.
- `df /`: space available on the backing root filesystem.
- `stat -c '%s %b' /var/tmp-build.img`: logical bytes and allocated 512-byte blocks.
- `du -h /var/tmp-build.img`: allocated backing-file space, not its capacity.

`fstrim -v` reports bytes submitted for possible discard. Repeated output is not
an additive measure of newly freed bytes. Compare backing-file allocation and
root free space before/after to measure actual reclamation.

The current cleanup policy trims only within the scratch-pressure cleanup path.
Consequently, normal workspace deletion can leave scratch mostly free while the
root filesystem still accounts for old image blocks. At Nov 5 00:00, logs showed
8% scratch pressure but 88% root usage. That is consistent with this gap; it does
not prove all root usage came from untrimmed image blocks. At the Nov 5 inspection,
the image was 26,843,545,600 logical bytes with 20,538,648 allocated 512-byte blocks
(about 9.79 GiB allocated).

This PR changes scheduling and instrumentation, not trim triggers, deletion
eligibility, or scratch formatting. A separate change should trigger bounded
trimming after workspace reclamation or when root pressure is high, independently
of scratch pressure, with actual before/after allocation measurements.

References: [fstrim manual](https://man7.org/linux/man-pages/man8/fstrim.8.html)
and [Linux loop discard implementation](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/drivers/block/loop.c).

## Validation and deployment

Run `bash -n operations/disk-clean.sh` and
`node --test __tests__/disk-clean-priority.test.mjs`. Tests replace priority
commands and disk probes; they never delete host data or change service priorities.
Actual idle-to-normal scheduler and I/O transitions were also checked on a
throwaway sleep process on the Linux host, then that process was terminated.
This establishes permission/support, not faster cleanup under live traffic.

Host scripts are installed separately from application pulls. Deploy only the
merged commit, compare live files first, and wait for an existing cleanup run to
finish before replacing `/var/www/disk-clean.sh`. Observe one scheduled run's
phase times and transitions, API health, and actual filesystem headroom before
claiming the recovery is faster. Do not run host-wide cleanup just to test it.
