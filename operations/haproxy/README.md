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

| Order | Owner                      | Policy                                                                                                                                                                                                                         |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | HAProxy                    | Security checks and `/stats` authentication.                                                                                                                                                                                   |
| 2     | HAProxy                    | Active cooldown blocks the responsible family/IP until expiry.                                                                                                                                                                 |
| 3     | HAProxy                    | 190/min across origin routes per known family, or trusted IP otherwise. Non-bot application traffic additionally allows 120/5m/IP. Stats and telemetry use their own routing and are excluded from this application allowance. |
| 4     | HAProxy                    | API and package pages: **26/min per request pool** (Google, search, AI, developer tools, SEO), across IPs; unrecognized bots use their trusted IP. Cache hits count too.                                                       |
| 5     | Server, after cache lookup | Hits return before the build guard. Misses share **10 build admissions/5m/IP** across analysis endpoints and are rejected when HAProxy signals **60 seconds of completed build time/5m/IP** has been spent.                    |
| 6     | HAProxy                    | Every returned **429** counts toward the responsible family/IP's cooldown: 30/min gives 5m; 120/min gives 15m. Persistent 429s can renew 15m with at most 5m left. Other 4xx do not count.                                     |

HAProxy owns traffic counters, classification, completed-build-time accounting
and cooldowns. The server owns cache lookup and one build-admission guard; it has
no general request limiter or bot-specific limit branches. The budget signal and
returned build duration are the bridge between those responsibilities. Spending
the build budget alone does not block cache hits; traffic limits/cooldown can.

Crawler pages prefer an already-built release but may build on a miss. Page/MCP
local API calls forward caller identity and budget state; only the outer request
spends the proxy allowance. Build admissions may coalesce. Completed-time
accounting does not reserve queued/in-flight work. Proxy rate windows roll; the
server admission window resets five minutes after its first admitted miss.

Known families come from `automation-groups.map`; other clients use trusted IPs.
Request pools: Google; search (Baidu, Bing, Apple, Yandex, Petal); AI (ByteDance,
OpenAI, Anthropic, Amazon); developer tools (Shields, Badgen,
Data-Pipeline-Enricher, Depscope); SEO (Ahrefs, Semrush, Dotbot, Awario).
Each pool shares 26/min. Cooldowns remain per original family/IP; a cooldown
never directly puts another family into cooldown. Members still share a request
allowance, so an exhausted pool can reject them until its rate falls.
User agents classify callers; they do not authenticate bots. 429s include
`Retry-After`; logs include `client_group`, `automation_budget` and `cooldown_s`.
HAProxy table state resets on reload/restart.
