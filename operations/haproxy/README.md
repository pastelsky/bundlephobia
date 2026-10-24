# HAProxy statistics

The public `/stats` dashboard is authenticated in HAProxy. Its static frontend is
served by the existing application; `/stats/api/` and `/stats/vmui/` are proxied directly
to VictoriaMetrics on localhost port 8428. HAProxy's Prometheus exporter listens
on localhost port 8406. See [`../victoriametrics/README.md`](../victoriametrics/README.md)
for setup.

The userlist belongs in `/etc/haproxy/conf.d/00-stats-users.cfg`, outside this
repository. Store only a crypt hash in that server-only file; never commit the
hash to Git:

```haproxy
userlist bundlephobia_stats_users
    user stats-admin password <sha512-crypt-hash>
```

Generate the hash interactively with `mkpasswd --method=sha-512`, then create
the server-only file and restrict access to it:

```sh
sudoedit /etc/haproxy/conf.d/00-stats-users.cfg
sudo chown root:root /etc/haproxy/conf.d/00-stats-users.cfg
sudo chmod 600 /etc/haproxy/conf.d/00-stats-users.cfg
```

After creating the server-only userlist, install the tracked files. Install the
automation map before validating the main configuration, which references it
by absolute path:

```sh
sudo install -o root -g root -m 644 /var/www/bundlephobia/operations/haproxy/automation-groups.map /etc/haproxy/automation-groups.map
sudo install -o root -g root -m 644 /var/www/bundlephobia/operations/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg
sudo install -o root -g root -m 644 /var/www/bundlephobia/operations/haproxy/conf.d/20-victoriametrics-metrics.cfg /etc/haproxy/conf.d/20-victoriametrics-metrics.cfg
sudo /usr/sbin/haproxy -Ws -f /etc/haproxy/haproxy.cfg -f /etc/haproxy/conf.d -c -S /run/haproxy-master.sock
sudo systemctl reload haproxy
```

## Request limits (in evaluation order)

| Order | Scope                               | Policy                                                                                                                                                                                                         |
| ----- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Security                            | Block sensitive paths; authenticate `/stats`; validate telemetry method.                                                                                                                                       |
| 2     | Active cooldown                     | Reject all routes for the responsible family/IP until expiry.                                                                                                                                                  |
| 3     | Origin traffic                      | 190/min per known family, or trusted IP for other clients; also 190/min per IP across API, package pages and telemetry.                                                                                        |
| 4     | Automated API **and package pages** | All non-Google automation shares **26/min** across families and IPs. Google has a separate 26/min. Cached responses also spend this allowance. `got`/Ahrefs additionally allow 8/min per family/IP.            |
| 5     | Application                         | Per IP: 120 requests/5m (950 for crawler cache preference); 10 build admissions/5m per analysis endpoint; 60 seconds of completed build time/5m. Cache hits bypass the build limits, not request limits.       |
| 6     | Response accounting                 | Every returned **429**, from any limiter, counts toward the responsible family/IP's cooldown: 30/min gives 5m; 120/min gives 15m. Continued 429s can renew 15m when at most 5m remain. Other 4xx do not count. |

Crawler pages prefer an already-built release but may build on a miss. Their
local API calls inherit the caller's identity and build budget; the outer page
spends the shared request allowance once. MCP calls do the same and propagate
429s and build duration. Build admissions can coalesce; they are not unique jobs.
Completed-time limits do not reserve queued/in-flight work.

Known families come from `automation-groups.map`; other clients use trusted IPs.
Cooldowns remain independent even when families share the non-Google allowance.
User agents classify callers; they do not authenticate Google or any other bot.
429s include `Retry-After`; logs include `client_group`, `automation_budget` and
`cooldown_s`. HAProxy table state resets on reload/restart.
