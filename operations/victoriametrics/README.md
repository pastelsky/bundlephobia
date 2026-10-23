# On-demand stats

The Bundlephobia Node app starts VictoriaMetrics on the first `/stats` UI/API
request and stops it after 30 minutes without stats traffic. The app itself is
already managed by PM2; this adds no always-running service. Metrics collection
pauses while VictoriaMetrics is stopped, and its data stays on disk for up to
30 days. The default VM cache limit is 256 MiB.

## Server setup

After deploying the code, install the pinned VictoriaMetrics binary on the
server (Linux amd64 shown; use `arm64` for an ARM host):

```sh
VERSION=v1.153.0
ARCH=amd64
ASSET="victoria-metrics-linux-$ARCH-$VERSION.tar.gz"
BASE_URL="https://github.com/VictoriaMetrics/VictoriaMetrics/releases/download/$VERSION"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
curl -fsSL "$BASE_URL/$ASSET" -o "$TMP_DIR/$ASSET"
curl -fsSL "$BASE_URL/${ASSET%.tar.gz}_checksums.txt" -o "$TMP_DIR/checksums.txt"
HASH=$(awk -v asset="$ASSET" '$2 == asset || $2 == "*" asset { print $1 }' "$TMP_DIR/checksums.txt")
printf '%s  %s\n' "$HASH" "$TMP_DIR/$ASSET" | sha256sum -c -
tar -xzf "$TMP_DIR/$ASSET" -C "$TMP_DIR"
sudo install -o root -g root -m 0755 "$TMP_DIR/victoria-metrics-prod" /usr/local/bin/victoria-metrics-prod
rm -rf "$TMP_DIR"
```

Install the scrape config and make the data directory writable by the PM2
account (the current production PM2 daemon runs as root):

```sh
sudo install -d -m 0750 /var/lib/bundlephobia-victoriametrics
sudo chown root:root /var/lib/bundlephobia-victoriametrics
sudo install -D -o root -g root -m 0644 /var/www/bundlephobia/operations/victoriametrics/promscrape.yml /etc/bundlephobia-victoriametrics/promscrape.yml
```

The app loads overrides from its untracked `.env`: `VICTORIAMETRICS_STORAGE_PATH`,
`VICTORIAMETRICS_SCRAPE_CONFIG`, `VICTORIAMETRICS_RETENTION`,
`VICTORIAMETRICS_MEMORY_ALLOWED_BYTES`, `VICTORIAMETRICS_MIN_FREE_DISK_SPACE_BYTES`,
and `STATS_IDLE_TIMEOUT_MS`. Restart with `pm2 restart all --update-env`.

Install the tracked HAProxy files and retain the server-only Basic Auth
userlist as described in [`../haproxy/README.md`](../haproxy/README.md). Check
the deployed HAProxy config before reloading it. The metrics exporter listens
only on `127.0.0.1:8406`; the public `/stats` route remains behind HAProxy auth.
