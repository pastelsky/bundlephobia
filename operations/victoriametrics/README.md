# HAProxy stats history

HAProxy authenticates `/stats` and proxies it directly to VictoriaMetrics. PM2
manages one VictoriaMetrics Go binary; no Node stats service or system service is
added. It scrapes every minute and retains 15 days. Data survives PM2 restarts,
but collection pauses while VictoriaMetrics or the host is down. HAProxy logs
are not backfilled. The measured process RSS is about 40 MiB; the 256 MiB
setting limits caches, not total process memory.

VictoriaMetrics compresses time-series samples itself. Its disk use still
depends on scrape volume, series churn, and index data. Retention is a time
limit, not a byte cap. The disk-clean cron fully resets stored history above
160 MiB, after gracefully stopping VictoriaMetrics. A dedicated 200 MiB
filesystem is the hard ceiling; the PM2 config leaves 20 MiB free for merges.

## Install

Install the pinned VictoriaMetrics binary (Linux amd64 shown; use `arm64` for
an ARM host):

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
```

For the 200 MiB disk ceiling, create a loop-backed filesystem once. Add
the final line to `/etc/fstab` so it is mounted before PM2 starts after reboot:

```sh
sudo install -d -m 0750 /var/lib/bundlephobia-victoriametrics
sudo truncate -s 209715200 /var/lib/bundlephobia-victoriametrics.img
sudo mkfs.ext4 -F /var/lib/bundlephobia-victoriametrics.img
sudo mount -o loop /var/lib/bundlephobia-victoriametrics.img /var/lib/bundlephobia-victoriametrics
echo '/var/lib/bundlephobia-victoriametrics.img /var/lib/bundlephobia-victoriametrics ext4 loop,nofail 0 0' | sudo tee -a /etc/fstab
sudo chown root:root /var/lib/bundlephobia-victoriametrics
```

Install the tracked scrape config and start the tracked PM2 config:

```sh
sudo install -D -o root -g root -m 0644 /var/www/bundlephobia/operations/victoriametrics/promscrape.yml /etc/bundlephobia-victoriametrics/promscrape.yml
sudo pm2 startOrReload /var/www/bundlephobia/operations/victoriametrics/ecosystem.config.cjs
sudo pm2 save
```

Install the tracked HAProxy files and retain the server-only Basic Auth userlist
as described in [`../haproxy/README.md`](../haproxy/README.md). Check the
deployed HAProxy config before reloading it. The `/stats` route and exporter
listener are both loopback-only behind HAProxy authentication.
