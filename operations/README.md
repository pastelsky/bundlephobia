# Scratch filesystem contract

[scratch-policy.json](scratch-policy.json) records each approved scratch directory,
its purpose and its normal cleanup owner. Temporary installs and generated bundles
belong in `packages`, package-manager caches in `cache`. Shared `installations` and
bounded `build-metrics` have service-owned retention. Additions need an explicit
reason and working cleanup coverage. Unknown paths fail the integration guard and
are reported by the cleaner rather than silently deleted.

`BUILD_TMP_DIR` selects one scratch root for package-build-stats, InstallationStore
and build metrics. Production defaults to `/tmp/tmp-build`. An explicit
`INSTALLATION_ROOT_PATH` remains supported; the integration test exercises the
shared default contract.

## Production cleanup

`node operations/cleanup-scratch.mjs` checks pressure at 60%, then reclaims old
workspaces and cache entries toward 40%. Workspaces must be older than one hour.
The host cleaner does not remove shared installs or metric history: their services
own normal expiry. It never follows a scratch directory symlink. Cache eviction
keeps Bun's staging directory. Existing crash output under the obsolete `artifacts`
parent needs a controlled one-time recovery after old writers stop.

After deploying a merged commit, source
`/var/www/bundlephobia/operations/cron/scratch-cleanup.sh` immediately before the
final `main` call in `/var/www/disk-clean.sh`. This replaces only its loop-volume
cleanup function with the versioned implementation. Keep the existing cron lock
and root-disk housekeeping. Verify that the active host script sources this exact
file and check logged before/after usage across cleanup cycles. Do not add a second
competing cleanup cron job.

`--all --root PATH` is for the isolated integration harness after its writers exit.
It requires a disposable marker owned by the invoking parent and refuses the
default production root. It removes only policy-listed directories, leaves unknown
paths visible, and fails if unmanaged data remains. It is not a production
force-delete flag.

## Native Linux integration guard

Run `bash operations/tests/scratch-contract.sh` on a disposable Linux runner with
Node 24, Bun 1.3.9, strace and passwordless sudo for a 128 MiB tmpfs mount. CI runs
this directly on GitHub Actions, without a container. Setup installs the exact
application-pinned builder and checks that both application manifests agree.
Dependency setup is outside tracing; runtime build operations and all children
are traced.

One integration scenario exercises concurrent real size/export analyses, a failed
build, cancellation, and SIGKILL after compilation. It checks observed scratch
paths against the documented policy, uses the actual pressure cleanup on aged
generated output, preserves young workspaces and shared installation leases, then
verifies quiescent cleanup leaves no output. It does not delete the entire scratch
root to make the assertion pass.

`strace -ff -y` follows runtime processes/threads and resolves writable descriptors
and directory-relative paths. The checker rejects successful file mutations
outside the allowed root, including transient writes. `/dev/null` is an explicit
non-data sink. Trace files and CI metadata are harness output outside the traced
process tree. Unresolved mutation paths fail closed. This is a regression check
for these exercised workloads, not an OS sandbox or a proof about every arbitrary
package/client combination. A separate negative control writes and deletes a tiny
unmanaged probe and requires the checker to reject it. See the
[strace descriptor decoding contract](https://man7.org/linux/man-pages/man1/strace.1.html).

For a not-yet-published upstream fix, set `PBS_PACKAGE_TARBALL` to a locally packed
tarball, or dispatch CI with `scratch_only=true` and `build_stats_ref` set to the
exact upstream commit. This changes only the disposable test runtime. Ordinary
PR CI always exercises the application-pinned registry version. Once the patch is
published, pin it in both manifests and lockfiles; the normal guard must pass
before this dependent PR is ready. The published 9.5.0 baseline is expected to fail
because it ignores `BUILD_TMP_DIR` and uses the obsolete output parent.
