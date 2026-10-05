# scripts

## Isolated build-memory replay (Linux)

With the installation service running, profile one exact package outside PM2:

```sh
node scripts/profile-build.ts easymc@1.0.6 --repeat 3
node scripts/profile-build.ts easymc@1.0.6 --repeat 3 --no-minify
node scripts/profile-build.ts @matbea-ui/matbea-ui@3.0.2 --operation exports-sizes
```

The supervisor leases one shared install, passes its paths into a fresh child,
and releases it even if the child is killed. It never installs locally. Only run
one replay at a time with sufficient host headroom; prefer a separate Linux runner
for heavy packages. Defaults stop the child after 120 seconds, observed RSS above
1 GiB, or trace output above 128 MiB. `--max-rss-mb` and `--timeout-ms` adjust the
first two limits. Limits are sampled safeguards, not hard cgroup memory caps.
`--output` must name a new directory. Files are retained for inspection, not
automatically uploaded or pruned.

Outputs:

- `rspack.log`: Rspack's native stage/plugin timing trace. Direct core users need
  `experiments.globalTrace.register/cleanup`; setting `RSPACK_PROFILE` alone does
  not enable this. The process-global trace stays out of normal request workers.
- `external-memory.json`: timestamped RSS, anonymous PSS and swap samples
  every 200 ms from the supervisor, unaffected by the child's blocked event loop.
- Existing build-metrics artifacts: library phase events, V8/external memory,
  CPU, concurrency and process-tree samples. Each replay handles one build at a time.
  Native callbacks that lose async context are attributed only with one active
  build and labeled `sole-active-build`; overlapping contextless events are omitted.
- `retained-N.json`: before/after/post-GC-and-idle memory for repeated builds.
- `result-N.json` and a Node CPU profile: compare outputs and JavaScript hotspots.

Align the external memory timestamps with native trace stages, then compare a
normal run with `--no-minify` and repeated builds. This toggle changes size results:
it is a diagnostic experiment, not a fix. The native trace is **not an allocation
profile**; if a stage retains native memory after GC/idle, use a native allocator
profiler with symbols on the isolated runner before claiming allocation ownership.
Rsdoctor can supplement plugin/module analysis, but its source collection adds
memory and should not be enabled by default during a memory investigation.

References: [Rspack tracing](https://rspack.rs/contribute/development/tracing),
[Rspack profiling](https://rspack.rs/contribute/development/profiling),
[Rsdoctor memory caveats](https://rsdoctor.rs/guide/more/faq).
