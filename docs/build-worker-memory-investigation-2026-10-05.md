# Build-worker native memory investigation — 2026-10-05

## Conclusion

The isolated `easymc@1.0.6` reproduction has two separate problems:

1. Rspack builds a large native export graph for deeply nested JSON, including
   Minecraft data. Native stack samples identify export-info BTreeMap insertion,
   recursive export merging, JSON parsing, and JSON cloning as allocation paths.
2. After compilation objects are freed, native allocators retain substantial
   resident memory. Returning those freed pages immediately reduces idle RSS
   dramatically. It does not eliminate the compilation peak.

This PR sets `MIMALLOC_PURGE_DELAY: '0'` **only for build workers**. It changes no
build semantics, installation ownership, concurrency, dependencies, or Node
version. No new production metrics or profiling service are needed.

This is evidence for this reproducible workload, not proof that every package
or every historical worker memory incident has the same cause.

## Controlled benchmark

The input is an installation prepared by the production installation service,
copied under a held lease, then released. The replay uses prepared paths;
there are no npm, Bun, or Yarn installs during measurement.

Environment: Linux ARM64 in a dedicated Colima VM; container limited to 4 CPUs,
6 GiB RAM, and no swap; Node 24.13.0, package-build-stats 9.3.0, Rspack 2.1.5.
The build-service dependency versions come from the deployed lockfile.
Production is a different host, so this is not a production throughput result.

Three fresh-process pairs ran default settings followed by immediate purging.
Each process built the same package three times sequentially, waited one second
between builds, then ten seconds after the last build. No explicit GC, native
tracing, or Rspack timing trace was enabled in these benchmark runs.
`/usr/bin/time -v` measured process peak RSS and CPU; existing package-builder
events measured build duration, excluding the deliberate idle periods.

| Median across three processes             |   Default | Immediate purge | Change |
| ----------------------------------------- | --------: | --------------: | -----: |
| RSS after final 10-second idle            | 1,517 MiB |         282 MiB | -81.4% |
| Whole-process peak RSS                    | 3,712 MiB |       3,361 MiB |  -9.5% |
| CPU time for three builds and idle        |    7.96 s |          8.84 s | +11.1% |
| Total library build time for three builds |   4.522 s |         4.805 s |  +6.3% |

All six processes exited successfully; all eighteen builds succeeded.
Idle V8 heap was approximately 25 MiB in both groups. The large RSS decrease
therefore is not a large JavaScript heap reduction. Forced-GC experiments
independently showed the same retention effect, but they are not the basis
of the production-like benchmark above.

The baseline output size was 50,893,876 bytes for all nine builds. Eight purge
builds matched; one was two bytes smaller. Gzip ranged from 3,696,631–3,696,633
bytes in controls and 3,696,628–3,696,633 with purging. Dependency sizes and
package metadata matched in the inspected two-byte-outlier comparison.
These are not bit-identical output results. Additional control-only repeats
of `got@11.8.6` produced both 102,632 and 102,634 bytes without changing any
setting, establishing existing two-byte output variability in that workload.
The setting controls memory reclamation, not compiler configuration.
Paired smaller-package checks measured equal Express bundle sizes, Got sizes
within that control range, and equal 228-byte nested-JSON fixture sizes.
Gzip differed by at most one byte in the Express/JSON pairs; control-only Got
gzip sizes already varied from 32,024 to 32,027 bytes.

Limitations: one large workload, ARM64 rather than production architecture,
three process pairs, and fixed control/treatment order. The CPU increase is
a real observed trade-off, not evidence of improved throughput. Returning
freed pages can prevent elevated idle memory from occupying the next build's
headroom, but continued production measurements must establish its net effect.

## Native allocation evidence

An initial Heaptrack run reported only about 75 MB of tracked live allocations
while process RSS exceeded 2 GB. It was incomplete: the published matching
`@rspack-debug/core@2.1.5` binding still contained mimalloc. Do not conclude
that Rust allocations are absent from a small system-allocator profile.
The diagnostic-only 2.1.8 binding also contained mimalloc; it was not used for
the paired benchmark or proposed production configuration.

A local-only, PID-filtered Linux uprobe on the matching debug binding's embedded
`_mi_malloc_generic` captured native allocator slow-path call stacks. Saved
process mappings and ELF symbols resolve them to:

- `rspack_core::exports::exports_info::ExportsInfoData::ensure_export_info`
- BTreeMap export-info insertion
- `rspack_plugin_javascript::plugin::flag_dependency_exports_plugin::merge_exports`
- JSON parser, vector cloning, and
  `rspack_plugin_json::json_exports_dependency::get_exports_from_data`

These samples identify allocation paths, not precise live-byte ownership.
Slow-path counts are not percentages of total allocations or total RSS.
An earlier probe with stack-ID collisions was discarded; the corrected probe
used shorter stacks and a larger map and produced populated symbolized stacks.
No native profiler or kernel probe was installed on production.

The Rspack 2.1.5 source supports the stack evidence:
[JSON export discovery](https://github.com/web-infra-dev/rspack/blob/v2.1.5/crates/rspack_plugin_json/src/json_exports_dependency.rs)
recursively enumerates nested data, and the
[JSON plugin](https://github.com/web-infra-dev/rspack/blob/v2.1.5/crates/rspack_plugin_json/src/lib.rs)
parses and clones JSON data. The
[native allocator](https://github.com/web-infra-dev/rspack/blob/v2.1.5/crates/rspack_allocator/src/lib.rs)
uses mimalloc. Other loaded native bindings also use mimalloc, so the purge
intervention is not exclusive attribution of all retained bytes to Rspack.

## Rejected alternatives

- **Lower JSON export depth globally:** setting `module.parser.json.exportsDepth`
  to 1 lowered the large workload's forced-GC replay peak from about 2.25 GiB
  to 1.64 GiB. However, a nested-JSON tree-shaking fixture changed from 228 to
  462 bytes, and gzip from 185 to 335 bytes. This changes measured bundle sizes
  and is unsuitable as a blanket fix. See the
  [Rspack parser documentation](https://rspack.rs/config/module-parser).
- **One-millisecond purge delay:** idle RSS remained about 1.5 GiB in the
  forced-GC experiment. A positive delay is not necessarily a background timer
  that returns pages when an otherwise idle worker stops allocating.
- **Abandoned-page purge alone:** final idle RSS remained about 1.48 GiB in
  the natural-GC experiment. It did not solve this workload's retention.
- **Upgrade Rspack just for profiling:** newer diagnostic bindings did not
  provide the assumed system-allocator coverage. No production upgrade is
  justified by this experiment.
- **More heap snapshots:** low V8 heap with large native RSS already directs
  this case outside the JavaScript heap. Existing phase events, process data,
  Rspack traces, and isolated native stacks supplied the required evidence.

The [mimalloc options](https://github.com/microsoft/mimalloc#environment-options)
explain why zero delay returns free pages promptly and can cost additional CPU
and page faults. This is a bounded worker-only retention mitigation, not an
allocator leak repair or a throughput optimization.

## Reproduction and remaining work

The production-safe supervisor remains `scripts/profile-build.ts`. A bounded
isolated replay against a local installation-service endpoint can be run as:

```sh
node scripts/profile-build.ts easymc@1.0.6 --repeat 3 \
  --max-rss-mb 4096 --timeout-ms 60000 --output /tmp/easymc-default
MIMALLOC_PURGE_DELAY=0 node scripts/profile-build.ts easymc@1.0.6 --repeat 3 \
  --max-rss-mb 4096 --timeout-ms 60000 --output /tmp/easymc-purge0
```

That supervisor enables tracing and explicit post-build GC; it is useful for
attribution, **not the exact no-forced-GC benchmark above**. The separate
research harness and raw benchmark artifacts are retained under
`/private/tmp/bundlephobia-native-roj3zR/evidence` on the investigation machine.
`benchmark-summary.json` records every paired run, versions, exit status,
output sizes, and summary calculation. Replay, symbolizer, BPF probe, maps,
native stacks, timing records, and phase samples are preserved alongside it.
In the research harness, the `gc-idle-*` label is historical: explicit GC is
skipped when `PROFILE_SKIP_GC=true`. The paired benchmark sets that option
and starts Node without `--expose-gc`.

After merging, apply the updated PM2 configuration to the existing build
processes with `pm2 startOrReload process.yml --only build-service --update-env`
and `pm2 save`. A plain restart of already registered processes should not be
assumed to reread a newly added YAML environment setting. Verify the option
on each worker and compare phase peaks, settled RSS, CPU/build latency, and
memory-triggered restarts under real traffic. Roll back by restoring the prior
PM2 configuration and explicitly deleting the option from PM2's saved worker
environments; do not assume removing the YAML line alone unsets an existing
environment variable.

The next compiler-level work is to reduce nested JSON export-graph allocation
while preserving tree-shaking, and investigate native compiler lifetime/GC
overlap between sequential builds. Peak RSS is still above 3 GiB in the
no-forced-GC replay and above the current 1,000 MiB PM2 worker threshold.
Immediate purging alone cannot make this workload safe under that threshold.
Installation-service restarts are a separate investigation: this setting is
intentionally not applied to the installer.
