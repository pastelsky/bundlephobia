# Host metrics

Optional Prometheus node_exporter (Go). VictoriaMetrics scrapes CPU, load,
RAM, selected filesystems, and network once per minute. No Node collector or
additional machine is needed. The static dashboard queries VictoriaMetrics.
Application outcome counters remain in the existing build/installer processes.

Install on Linux amd64, then start separately from the application services:

```sh
set -eu
VERSION=1.12.1
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
ASSET="node_exporter-$VERSION.linux-amd64.tar.gz"
BASE="https://github.com/prometheus/node_exporter/releases/download/v$VERSION"
curl -fsSL "$BASE/$ASSET" -o "$TMP_DIR/$ASSET"
curl -fsSL "$BASE/sha256sums.txt" -o "$TMP_DIR/sha256sums.txt"
(cd "$TMP_DIR" && awk -v asset="$ASSET" '$2 == asset' sha256sums.txt | sha256sum -c -)
tar -xzf "$TMP_DIR/$ASSET" -C "$TMP_DIR"
sudo install -m 0755 "$TMP_DIR/node_exporter-$VERSION.linux-amd64/node_exporter" /usr/local/bin/node_exporter
sudo pm2 startOrReload /var/www/bundlephobia/operations/node-exporter/ecosystem.config.cjs
sudo pm2 save
```

Install the [VictoriaMetrics scrape config](../victoriametrics/README.md) too.
Keep mount paths in the exporter config and dashboard chart definitions aligned.
`GOMEMLIMIT` is a soft Go memory budget; PM2 has a separate 64 MB restart guard.
