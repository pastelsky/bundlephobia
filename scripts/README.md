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

## Weekly consumer-manifest discovery

The private `packages/library-discovery` workspace feeds leads to the existing
weekly research agent, which verifies browser use, category fit and tradeoffs.
It does not publish recommendations itself. Run `yarn test:recommendations` for
collector and publisher tests.

Start with `index.mjs` for the pipeline and `config.json` for budgets/topics.
`search.mjs` finds and scans repositories; `manifests.mjs` handles paths and
consumer declarations; `npm.mjs` screens and ranks leads. State validation lives
with the pipeline in `index.mjs`; `http.mjs` handles API pacing/retries. The workflow
runs `cli.mjs` directly. Dependencies belong to this workspace: Octokit,
`npm-package-arg`, `git-url-parse`, Zod, `p-throttle` and `p-retry`.

Each run rotates approved catalogue seeds and interleaves consumer-code searches
with framework-topic searches. Repository metadata excludes private, inactive,
low-star, forked and archived repositories. A private manifest with a web build/dev
script identifies an app; framework identities come from shared comparison data.
Selected internal workspaces are followed, while obvious server/test/example paths
are excluded. This is a bounded sample, not proof of production or browser use.

Candidates need two distinct consumer owners other than their upstream owner,
a non-deprecated npm identity and minimum download usage. Runtime declarations
are prioritized; dev-only candidates need a published browser-support hint.
There is no package/scope denylist: the research agent excludes tooling/server-only
usage. Ranking compares two complete 28-day npm download periods, then downloads,
with one package per upstream per batch. Downloads include indirect installs and
automation; growth is not independent adoption velocity.

Approved, pending, comparison-group and previously surfaced names are excluded.
Repo-memory persists the cursor and delivered names in `state.json` on
`memory/library-discovery`. Overflow stays eligible; malformed history fails
rather than resetting. State advances only after collection; a failed memory push
can replay a batch. Removing a surfaced name explicitly allows reconsideration.
Maintainer rejection feedback remains part of the existing research PR flow.

Reports include windows, sample counts, budgets and unavailable evidence. Truncated
sources are skipped; exhausted npm rate limits defer remaining candidates. Code
search may need cross-repository credentials; topic searches provide a fallback.
This optional source can fail without blocking other research vectors. There is
no depth-two crawl, PageRank or historical adoption backfill.

Preview without writing memory or publishing:

```sh
NODE_USE_ENV_PROXY=1 GITHUB_TOKEN="$(gh auth token)" GITHUB_REPOSITORY=pastelsky/bundlephobia \
  LIBRARY_DISCOVERY_OUTPUT=/tmp/library-discovery-preview.json \
  node packages/library-discovery/cli.mjs --dry-run
```
