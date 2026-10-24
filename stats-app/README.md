# Stats app

Static dashboard served by Bundlephobia. HAProxy authenticates `/stats/` and
proxies `/stats/api/` to VictoriaMetrics.

```sh
corepack yarn stats:build
```

For development, run `ssh -N -L 8428:127.0.0.1:8428 bphobia`, then
`corepack yarn stats:dev`. Open `http://localhost:5174/stats/dashboard/`.

Declare charts in `src/dashboard/charts.ts`: queries, labels, colors, and
formatting stay in one definition. Reference them in `src/dashboard/pages.ts`
to arrange pages and tabs; a tab without panels inherits its page's charts. Use the root lint,
typecheck, and build commands for checks.

Components own colocated CSS Modules under `src/components/`. Shared base styles
live in `src/styles/`; Tremor owns interactive controls and table primitives.
