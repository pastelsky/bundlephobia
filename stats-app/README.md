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

Panel definitions and summary queries live in `src/metrics.ts`. Only existing
HAProxy metrics are queried. API results stay in browser memory; refreshing
pauses in background tabs. Missing history is displayed as gaps.

The isolated dependency tree uses React 18, supported by Tremor's npm package;
the main Bundlephobia application keeps its own React version. Run `lint`,
`test`, and `build` in this directory before publishing new static assets.
