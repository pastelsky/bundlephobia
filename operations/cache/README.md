# Optional Bun retention policy

`bun-policy` defaults to `oldest`. Keep S3FIFO disabled until the SDK cleanup/
lockfile release is published, pinned in both workspaces, and this PR is reviewed.
Changing it to `s3fifo` and restarting the installer and build workers enables accounting and the
existing ten-minute cron's loopback cleanup request. Install the reviewed
`disk-clean.sh` at `/var/www/disk-clean.sh`; no new service or cron entry is needed.
`yarn build` emits the short-lived JavaScript worker; `yarn cache-policy:build`
builds only that worker without rebuilding the web app.

S3FIFO uses entry-count queues; real byte/inode pressure controls deletion.
Only completed Bun materializations are recorded, including transitive dependencies;
reuse of an already-installed tree does not exercise Bun's download cache.
The Bun cache filename adapter reports unmatched demand instead of inventing hits.
No package files are recursively scanned for accounting or candidate discovery.

Metadata lives outside the build volume in `BUN_CACHE_STATE_DIR` (default
`/var/lib/bundlephobia-cache-policy`): two 8 MiB usage segments and a gzip snapshot
capped at 4 MiB. Queue metadata is capped at 100,000 resident entries plus ghost
history. Rotation can lose unconsumed demand; these are retention hints, not billing.
Shared Linux `flock` locks cover Bun commands; cleanup waits up to 65 seconds for
an exclusive lock, quarantines complete entries and runs a
short-lived Node job with idle priority, a 96 MiB heap and a 20-second deadline.
Existing builds keep their installation hardlinks. Failure defers cache eviction
instead of falling through to an uncoordinated full wipe.
