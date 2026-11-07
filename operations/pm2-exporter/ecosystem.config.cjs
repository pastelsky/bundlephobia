module.exports = {
  apps: [
    {
      name: 'bundlephobia-pm2-exporter',
      script: '/var/www/bundlephobia/operations/pm2-exporter/exporter.cjs',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      env: {
        PM2_CLI: '/usr/local/bin/pm2',
        PM2_HOME: '/root/.pm2',
        PORT: '8413',
      },
      autorestart: true,
      max_memory_restart: '64M',
      restart_delay: 1000,
      kill_timeout: 5000,
      watch: false,
      vizion: false,
    },
  ],
}
