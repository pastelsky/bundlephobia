# Optional Bun retention policy

`bun-policy` defaults to `oldest`. Keep the reuse policy disabled until the SDK cleanup/
lockfile release is published, pinned in both workspaces, and this PR is reviewed.
Changing it to `reuse` and restarting the installer and build workers enables accounting and the
existing ten-minute cron's loopback cleanup request. Install the reviewed
`disk-clean.sh` at `/var/www/disk-clean.sh`; no new service or cron entry is needed.
`yarn build` emits the short-lived JavaScript worker; `yarn cache-policy:build`
builds only that worker without rebuilding the web app.

The reuse policy adapts FIFO probation/hot/ghost queues to the current catalog.
A second materialization qualifies for promotion; bounded counters age on eviction.
Installation leases govern workspace lifetime; reuse counters are not live references.
The kernel reclaims payloads at their last hardlink; byte/inode pressure after each
batch governs when eviction stops. Ranking is not yet weighted by per-entry cost.
Completed Bun installations record transitive version reuse across root packages;
reusing an installation tree does not count as another Bun cache access.
Unmatched filenames remain unknown. Accounting never recursively scans payloads.

Metadata lives outside the build volume in `BUN_CACHE_STATE_DIR` (default
`/var/lib/bundlephobia-cache-policy`): two 8 MiB usage segments and a gzip snapshot
capped at 4 MiB. Queue metadata is capped at 100,000 resident entries plus ghost
history. Rotation can lose unconsumed demand; these are retention hints, not billing.
Shared Linux `flock` locks cover Bun commands; cleanup waits up to 65 seconds for
an exclusive lock, quarantines complete entries and runs a
short-lived Node job with idle priority, a 96 MiB heap and a 20-second deadline.
Existing builds keep their installation hardlinks. Failure defers cache eviction
instead of falling through to an uncoordinated full wipe.
