module.exports = {
  apps: [
    {
      name: 'bundlephobia-victoriametrics',
      script: '/usr/local/bin/victoria-metrics-prod',
      interpreter: 'none',
      exec_mode: 'fork',
      instances: 1,
      args: [
        '-storageDataPath=/var/lib/bundlephobia-victoriametrics',
        '-promscrape.config=/etc/bundlephobia-victoriametrics/promscrape.yml',
        '-promscrape.configCheckInterval=10s',
        '-promscrape.maxScrapeSize=16MiB',
        '-retentionPeriod=15d',
        '-httpListenAddr=127.0.0.1:8428',
        '-http.pathPrefix=/stats',
        // Cache allowance is not an RSS cap; leave room below PM2's 128M guard.
        '-memory.allowedBytes=32MiB',
        '-search.maxConcurrentRequests=2',
        '-search.maxMemoryPerQuery=16MiB',
        // Avoid the response cache's minimum allocation for this small dashboard.
        '-search.disableCache',
        '-storage.minFreeDiskSpaceBytes=20MiB',
        '-loggerLevel=WARN',
      ],
      autorestart: true,
      max_memory_restart: '128M',
      restart_delay: 1000,
      kill_timeout: 10000,
      watch: false,
      vizion: false,
    },
  ],
}
