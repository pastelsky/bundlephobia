# PM2 process metrics

This dashboard uses the pinned `pm2-prom-module` PM2 module to expose process
restart counts, status, uptime, CPU, and memory in Prometheus format. The
VictoriaMetrics scrape job samples it once per minute.

Set the listener and collection interval before installing the module so its
endpoint stays on loopback and does not poll more often than the dashboard
needs:

```sh
sudo pm2 set pm2-prom-module:hostname 127.0.0.1
sudo pm2 set pm2-prom-module:port 9988
sudo pm2 set pm2-prom-module:app_check_interval 15000
sudo pm2 install pm2-prom-module@2.7.3
sudo pm2 save
```

Verify the endpoint locally with `curl http://127.0.0.1:9988/metrics` and
confirm the returned `pm2_app_restart_count`, `pm2_app_pids_cpu`,
`pm2_app_pids_memory`, `pm2_app_status`, and `pm2_app_uptime` metrics before
installing the tracked VictoriaMetrics scrape config. Restart history starts
with the first scrape; PM2's current restart counts cannot reconstruct earlier
per-interval history.
