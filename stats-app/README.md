# Stats app

Static Tremor/React workspace. Vite builds static files into
`client/assets/public/stats/dashboard/`, served by the existing Bundlephobia
server. HAProxy authenticates the page and forwards `/stats/api/` to
VictoriaMetrics. No dashboard daemon, log importer, or additional database.

```sh
corepack yarn install --immutable
corepack yarn stats:build
```

For local development, forward the existing database with
`ssh -N -L 8428:127.0.0.1:8428 bphobia`, then run
`corepack yarn stats:dev` and open
`http://localhost:5174/stats/dashboard/`. The dev proxy uses that forwarded port.

Pages and tabs are declared in `src/pages.ts`; panel queries live in
`src/metrics.ts`. HAProxy and application counters are queried. API results stay in
browser memory; refreshing pauses in background tabs. Missing history is displayed as gaps.

The workspace uses the repository's lint rules, formatter, TypeScript version,
and root lockfile. Normal `yarn build` builds the dashboard; `yarn typecheck`
checks both apps. Tremor requires React 18, scoped to this workspace; the main
app keeps React 19. CI runs dashboard queries alongside the existing checks.

Application counters start collecting after the services and scrape config are
deployed; they cannot backfill old outcomes. Completed installs exclude cached
reuse. Build attempts include size/export analysis and installation failures;
process kills cannot record completion. Ports 8410–8412 map to the three existing
PM2 build workers (update scrape targets when scaling); installer metrics use
its existing loopback port 7003. That endpoint also reads host CPU, load, memory,
swap, network, and three filesystem counters once per scrape, without a separate
agent or disk traversal. Host collection needs Linux `/proc`; memory usage
excludes reclaimable cache. No default runtime metrics or package labels.
