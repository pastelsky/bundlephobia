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

The private `packages/library-discovery` workspace (`@bundlephobia/library-discovery`)
owns the discovery modules, dependencies and tests. The existing recommendation
automation workspace depends on it. It uses Octokit for GitHub requests,
`npm-package-arg` for dependency specs, `picomatch` for paths, `git-url-parse` for
repository identities, Zod for state validation, and `p-throttle`/`p-retry` for API
pacing and retry budgets. No new service or separate package installation is needed.

Start with `index.mjs` for the pipeline and `config.json` for its budgets.
`search.mjs` finds repositories, `repositories.mjs`/`manifests.mjs` read consumer
evidence, and `candidates.mjs`/`npm.mjs` screen leads. `http.mjs` owns API pacing;
`catalog.mjs` owns catalogue exclusions and persisted state validation. The workflow
entry point only calls `cli.mjs`, which reads inputs and writes the report/state.

The optional JavaScript source in `packages/library-discovery/index.mjs` feeds the
existing `library-research` workflow. It produces leads for the research agent;
it does not edit the catalogue or decide whether two libraries are substitutes.

Each successful run rotates six approved catalogue packages as reverse-search
seeds and also searches Vue, Svelte, Solid, Lit, React and web-app topics. It reads
pinned manifests from active, non-fork, non-archived repositories with at least
100 stars. The app heuristic requires a private manifest and a web build/dev script
or a framework from the existing shared comparison groups. It follows loaded internal workspaces, includes development
dependencies and rejects obvious server/example/test paths. This is a bounded,
incomplete sample; framework topics and manifests cannot prove browser execution.

There is no package-name or scope denylist. Runtime declarations are prioritized
before npm checks. A dev-only candidate remains eligible when its published
metadata declares browser support; this is an explicit hint for research, not
proof of browser execution. The research agent owns the final tooling/server
classification. Framework identities come from the shared comparison data.

A candidate needs declarations under two different owners other than the package
repository owner, a non-deprecated npm identity, and at least 1,000 estimated
weekly downloads (last 28 days divided by four). These are screening thresholds,
not acceptance criteria. npm growth compares the last two complete 28-day periods;
it includes indirect installs and automation and is not adoption velocity. Leads
are ordered by that growth, then downloads, with one representative per upstream
repository in a batch. npm requests are paced and 429 responses use bounded retries. All date windows, sample counts,
budgets and source failures accompany the report.

Budgets and supported search topics live in `packages/library-discovery/config.json`,
separately from discovery logic. Defaults per run are two pages per query, 80 repositories, 12 manifests per repo,
100 npm checks and 30 surfaced candidates. Search results are interleaved across
sources; the cursor rotates their starting points. Missing/truncated sources and
budget limits are reported, never interpreted as negative quality evidence.
There is no depth-two crawl, PageRank, LLM scoring or historical manifest backfill.

Approved catalogue entries, broad comparison-group members, the pending catalogue
and previously surfaced names are excluded. The cursor and surfaced names persist
in `state.json` on the workflow-managed `memory/library-discovery` branch. State
advances only after collection completes; only the delivered batch is marked
surfaced, so overflow remains eligible. A failed workflow/memory push can replay a
batch; it cannot erase existing history. Removing a name from state explicitly
allows reconsideration. Reviewers' rejection instructions still apply through
the existing research PR feedback flow, including leads from other sources.

Preview without writing memory or publishing anything:

```sh
NODE_USE_ENV_PROXY=1 GITHUB_TOKEN="$(gh auth token)" GITHUB_REPOSITORY=pastelsky/bundlephobia \
  LIBRARY_DISCOVERY_OUTPUT=/tmp/library-discovery-preview.json \
  node .github/scripts/run-library-discovery.mjs --dry-run
```

Run `yarn test:recommendations` for collector and publisher tests. The scheduled
workflow uses the existing focused automation workspace, GitHub API client and
repo-memory persistence; its other research sources remain available if this
source fails. GitHub code search may require a credential with cross-repository
code-search access; failures are reported and framework-topic searches continue.
