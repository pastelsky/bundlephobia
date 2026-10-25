// Optional service: start only after installing the Go binary (see README).
module.exports = {
  apps: [
    {
      name: 'bundlephobia-node-exporter',
      script: '/usr/local/bin/node_exporter',
      interpreter: 'none',
      exec_mode: 'fork',
      instances: 1,
      env: { GOMAXPROCS: '1', GOMEMLIMIT: '24MiB' },
      args: [
        '--web.listen-address=127.0.0.1:9100',
        '--web.disable-exporter-metrics',
        // Avoid unrelated collectors and high-cardinality device metrics.
        '--collector.disable-defaults',
        '--collector.cpu',
        '--collector.loadavg',
        '--collector.meminfo',
        '--collector.filesystem',
        '--collector.netdev',
        '--collector.filesystem.mount-points-include=^(/|/tmp/tmp-build|/var/lib/bundlephobia-victoriametrics)$',
        '--collector.netdev.device-exclude=^(lo|veth.*|docker.*|br-.*|virbr.*|tun.*|tap.*)$',
      ],
      autorestart: true,
      max_memory_restart: '64M',
      restart_delay: 1000,
      kill_timeout: 5000,
      watch: false,
      vizion: false,
    },
  ],
}
