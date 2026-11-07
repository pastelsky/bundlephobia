# PM2 process metrics

This small local exporter reads PM2's `jlist` metadata every 15 seconds and
exposes process restart counts, unstable restarts, uptime, status, CPU, and
memory at `127.0.0.1:8413/metrics`. It excludes itself. VictoriaMetrics stores
the samples, so the dashboard can show restart events over any retained range.

After deploying the application change, compare the live VictoriaMetrics scrape
config with the tracked one and reconcile any server-only settings before
installing it. Then install the scrape config and exporter:

```sh
sudo diff -u /etc/bundlephobia-victoriametrics/promscrape.yml /var/www/bundlephobia/operations/victoriametrics/promscrape.yml
sudo install -D -o root -g root -m 0644 /var/www/bundlephobia/operations/victoriametrics/promscrape.yml /etc/bundlephobia-victoriametrics/promscrape.yml
sudo pm2 startOrReload /var/www/bundlephobia/operations/pm2-exporter/ecosystem.config.cjs
sudo pm2 save
```

The PM2 CLI path and PM2 home must match the root PM2 daemon. The exporter is
loopback-only. VictoriaMetrics reloads the config every 10 seconds; no restart
is needed. Restart charts begin at the first exporter scrape; existing PM2
restart counts cannot reconstruct per-interval history from before collection.
