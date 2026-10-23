# Scratch cleanup check

Run `node operations/scratch-cleanup-check.mjs` on a disposable Linux runner with
Node, npm, Bun and bubblewrap. GitHub Actions runs it directly. It builds two real
packages with retained output, ages the generated workspaces, then runs the same
cleanup function used by production. Everything except the documented `packages`
and `cache` directories is read-only during builds. Caches retain their existing
pressure-eviction policy; the check verifies workspace recovery, not cache expiry.

After deploying a merged commit, source
`/var/www/bundlephobia/operations/cleanup-workspaces.sh` immediately before `main`
in `/var/www/disk-clean.sh`. This shares the existing function with the check;
thresholds, locking, cache eviction and other host housekeeping stay in that job.
