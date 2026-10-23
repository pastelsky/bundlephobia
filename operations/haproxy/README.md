# HAProxy statistics dashboard

The public dashboard is served at `/stats` through the `bundlephobia_http`
frontend. Requests must come through Cloudflare and authenticate against the
`bundlephobia_stats_users` userlist. Administrative actions are disabled.

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

After creating the server-only userlist, install the tracked files. The
`00-` and `10-` prefixes ensure the userlist is loaded before the stats backend
from HAProxy's `conf.d` directory:

```sh
sudo install -o root -g root -m 644 /var/www/bundlephobia/operations/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg
sudo install -o root -g root -m 644 /var/www/bundlephobia/operations/haproxy/conf.d/10-stats-backend.cfg /etc/haproxy/conf.d/10-stats-backend.cfg
sudo install -o root -g root -m 644 /var/www/bundlephobia/operations/haproxy/conf.d/20-victoriametrics-metrics.cfg /etc/haproxy/conf.d/20-victoriametrics-metrics.cfg
sudo /usr/sbin/haproxy -Ws -f /etc/haproxy/haproxy.cfg -f /etc/haproxy/conf.d -c -S /run/haproxy-master.sock
sudo systemctl reload haproxy
```

The dashboard backend starts the on-demand VictoriaMetrics service over its
localhost-only systemd socket. Follow
[`../victoriametrics/README.md`](../victoriametrics/README.md) to install and
enable that socket before exposing `/stats`.
