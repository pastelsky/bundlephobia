# Stats app

Static dashboard served by Bundlephobia. HAProxy authenticates `/stats/` and
proxies `/stats/api/` to VictoriaMetrics.

```sh
corepack yarn stats:build
```

For development, run `ssh -N -L 8428:127.0.0.1:8428 bphobia`, then
`corepack yarn stats:dev`. Open `http://localhost:5174/stats/dashboard/`.

Declare charts in `src/dashboard/charts.ts` and arrange pages in
`src/dashboard/pages.ts`. Dashboard-specific composition lives under
`src/dashboard/`; reusable, data-independent UI lives under `src/components/ui/`.
Use Tailwind utilities and shared components for styling. Root lint, typecheck,
and build commands cover this app.
