# On-demand VictoriaMetrics stats

The authenticated `/stats` route serves VictoriaMetrics' VMUI. The first
request activates a localhost-only gateway socket; the gateway starts
VictoriaMetrics, waits for its readiness endpoint, and proxies the request.
After 30 minutes without a dashboard request it stops VictoriaMetrics. Its
data directory remains on disk, with 30 days of retention. HAProxy metrics are
scraped every 60 seconds only while VictoriaMetrics is running, so time spent
asleep has no samples.

The service is limited to a 384 MiB systemd memory cgroup, and VictoriaMetrics
is configured to use up to 256 MiB for its caches. The 1 GiB free-space
threshold prevents collection from filling a nearly full filesystem. These
defaults can be changed in a systemd drop-in as described below.

## Install

Run these commands on the Bundlephobia server after deploying the repository
changes. They create a dedicated unprivileged account, install the pinned
VictoriaMetrics binary with its published SHA-256 checksum verified, and
install the source-controlled scrape and systemd configuration:

```sh
sudo useradd --system --home-dir /var/lib/bundlephobia-victoriametrics --shell /usr/sbin/nologin bundlephobia-stats
sudo install -d -o bundlephobia-stats -g bundlephobia-stats -m 0750 /var/lib/bundlephobia-victoriametrics
sudo install -d -o root -g root -m 0755 /etc/bundlephobia-victoriametrics
sudo /var/www/bundlephobia/operations/victoriametrics/install-victoriametrics.sh
sudo install -o root -g root -m 0644 /var/www/bundlephobia/operations/victoriametrics/promscrape.yml /etc/bundlephobia-victoriametrics/promscrape.yml
sudo install -o root -g root -m 0644 /var/www/bundlephobia/operations/victoriametrics/bundlephobia-stats.service /etc/systemd/system/bundlephobia-stats.service
sudo install -o root -g root -m 0644 /var/www/bundlephobia/operations/victoriametrics/bundlephobia-stats.socket /etc/systemd/system/bundlephobia-stats.socket
sudo systemctl daemon-reload
sudo systemctl enable --now bundlephobia-stats.socket
```

Do not enable or start `bundlephobia-stats.service` directly. Systemd starts it
when HAProxy connects to `127.0.0.1:8410` and stops it after the gateway's idle
timer expires.

Install the HAProxy files and reload HAProxy using the instructions in
[`../haproxy/README.md`](../haproxy/README.md). The password hash remains in
the server-only `/etc/haproxy/conf.d/00-stats-users.cfg`; no credentials are
stored in this repository.

## Tune or inspect

Use a systemd drop-in for host-specific paths or resource settings so local
configuration stays separate from the repository:

```sh
sudo systemctl edit bundlephobia-stats.service
```

For example, to use a different data path and idle timeout:

```ini
[Service]
Environment=VICTORIAMETRICS_STORAGE_PATH=/srv/metrics/bundlephobia
Environment=STATS_IDLE_TIMEOUT_MS=900000
ReadWritePaths=/srv/metrics/bundlephobia
```

Create the replacement data directory with ownership `bundlephobia-stats` and
mode `0750`. The unit's `ReadWritePaths` must include the selected path. Other
supported overrides are `VICTORIAMETRICS_BIN`,
`VICTORIAMETRICS_SCRAPE_CONFIG`, `VICTORIAMETRICS_LISTEN_ADDR`,
`VICTORIAMETRICS_RETENTION`, `VICTORIAMETRICS_MEMORY_ALLOWED_BYTES`,
`VICTORIAMETRICS_MIN_FREE_DISK_SPACE_BYTES`,
`VICTORIAMETRICS_STARTUP_TIMEOUT_MS`, and `STATS_IDLE_TIMEOUT_MS`.

Apply a drop-in with:

```sh
sudo systemctl daemon-reload
sudo systemctl restart bundlephobia-stats.socket
```

The new values are used on the next service activation. If the service is
currently active, stopping it lets the still-enabled socket start it again on
the next `/stats` request:

```sh
sudo systemctl stop bundlephobia-stats.service
```

The service itself should be inactive while idle. To inspect an active or
recent startup:

```sh
systemctl status bundlephobia-stats.socket bundlephobia-stats.service
sudo journalctl -u bundlephobia-stats.service -n 100 --no-pager
curl -sS http://127.0.0.1:8406/metrics | head
```

`127.0.0.1:8406` is the HAProxy Prometheus exporter and is not exposed publicly.
The existing HAProxy userlist protects the public `/stats` route.
