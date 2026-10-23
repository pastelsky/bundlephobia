# Stats app

Independent Tremor/React app. Vite builds static files into
`client/assets/public/stats/dashboard/`, served by the existing Bundlephobia
server. HAProxy authenticates the page and forwards `/stats/api/` to
VictoriaMetrics. No dashboard daemon, log importer, or additional database.

```sh
corepack yarn --cwd stats-app install --immutable
corepack yarn --cwd stats-app build
```

For local development, forward the existing database with
`ssh -N -L 8428:127.0.0.1:8428 bphobia`, then run
`corepack yarn --cwd stats-app dev` and open
`http://localhost:5174/stats/dashboard/`. The dev proxy uses that forwarded port.

Pages and tabs are declared in `src/pages.ts`; panel queries live in
`src/metrics.ts`. HAProxy and application counters are queried. API results stay in browser memory; refreshing
pauses in background tabs. Missing history is displayed as gaps.

The isolated dependency tree uses React 18, supported by Tremor's npm package;
the main Bundlephobia application keeps its own React version. Run `lint`,
`test`, and `build` in this directory before publishing new static assets.

Application counters start collecting after the services and scrape config are
deployed; they cannot backfill old outcomes. Completed installs exclude cached
reuse. Build attempts include size/export analysis and installation failures;
process kills cannot record completion. Ports 8410–8412 map to the three existing
PM2 build workers (update scrape targets when scaling); installer metrics use
its existing loopback port 7003. No default runtime metrics or package labels.
