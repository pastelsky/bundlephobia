const { execFile } = require('node:child_process')

const http = require('node:http')

const PORT = Number(process.env.PORT || 8413)

const PM2_CLI = process.env.PM2_CLI || '/usr/local/bin/pm2'

const PM2_HOME = process.env.PM2_HOME || '/root/.pm2'

const EXPORTER_NAME = 'bundlephobia-pm2-exporter'

const POLL_INTERVAL_MS = 15_000

const METRIC_HEADERS = [
  '# HELP bundlephobia_pm2_exporter_poll_success Whether the latest PM2 metadata query succeeded.',
  '# TYPE bundlephobia_pm2_exporter_poll_success gauge',
  '# HELP bundlephobia_pm2_exporter_last_success_timestamp_seconds Unix timestamp of the latest successful PM2 metadata query.',
  '# TYPE bundlephobia_pm2_exporter_last_success_timestamp_seconds gauge',
  '# HELP bundlephobia_pm2_process_up Whether the PM2 process is online.',
  '# TYPE bundlephobia_pm2_process_up gauge',
  '# HELP bundlephobia_pm2_process_restarts_total PM2 restart count for this process.',
  '# TYPE bundlephobia_pm2_process_restarts_total counter',
  '# HELP bundlephobia_pm2_process_unstable_restarts_total PM2 unstable restart count for this process.',
  '# TYPE bundlephobia_pm2_process_unstable_restarts_total counter',
  '# HELP bundlephobia_pm2_process_uptime_seconds Time since PM2 last started this process.',
  '# TYPE bundlephobia_pm2_process_uptime_seconds gauge',
  '# HELP bundlephobia_pm2_process_memory_bytes Resident memory reported by PM2.',
  '# TYPE bundlephobia_pm2_process_memory_bytes gauge',
  '# HELP bundlephobia_pm2_process_cpu_percent CPU utilization reported by PM2.',
  '# TYPE bundlephobia_pm2_process_cpu_percent gauge',
  '# HELP bundlephobia_pm2_process_status PM2 process state, represented as a one-hot gauge.',
  '# TYPE bundlephobia_pm2_process_status gauge',
]

function escapeLabel(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll('"', '\\"')
}

function numeric(value) {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function processEnvironment(app) {
  return app.pm2_env || {}
}

function processName(app, env) {
  return app.name || env.name || 'unknown'
}

function processId(app, env) {
  return app.pm_id ?? env.pm_id ?? 'unknown'
}

function processMetrics(app, now) {
  const env = processEnvironment(app)

  const name = processName(app, env)

  if (name === EXPORTER_NAME) return []

  const pmId = processId(app, env)

  const worker = `${name} #${pmId}`

  const status = env.status || 'unknown'

  const labels = `app="${escapeLabel(name)}",pm_id="${escapeLabel(pmId)}",worker="${escapeLabel(worker)}"`

  return [
    `bundlephobia_pm2_process_up{${labels}} ${isOnline(status) ? 1 : 0}`,
    `bundlephobia_pm2_process_restarts_total{${labels}} ${numeric(env.restart_time)}`,
    `bundlephobia_pm2_process_unstable_restarts_total{${labels}} ${numeric(env.unstable_restarts)}`,
    `bundlephobia_pm2_process_uptime_seconds{${labels}} ${processUptime(env, now)}`,
    `bundlephobia_pm2_process_memory_bytes{${labels}} ${numeric(app.monit?.memory)}`,
    `bundlephobia_pm2_process_cpu_percent{${labels}} ${numeric(app.monit?.cpu)}`,
    `bundlephobia_pm2_process_status{${labels},status="${escapeLabel(status)}"} 1`,
  ]
}

function isOnline(status) {
  return status === 'online'
}

function processUptime(env, now) {
  if (!isOnline(env.status)) return 0

  const pmUptime = Number(env.pm_uptime)

  if (!Number.isFinite(pmUptime) || pmUptime <= 0) return 0

  return Math.max(0, (now - pmUptime) / 1000)
}

function renderMetrics(apps, { pollSuccess, lastSuccess, now = Date.now() }) {
  const metrics = [
    ...METRIC_HEADERS,
    `bundlephobia_pm2_exporter_poll_success ${pollSuccess ? 1 : 0}`,
    `bundlephobia_pm2_exporter_last_success_timestamp_seconds ${numeric(lastSuccess)}`,
    ...apps.flatMap(app => processMetrics(app, now)),
  ]

  return `${metrics.join('\n')}\n`
}

function getProcessList() {
  return new Promise((resolve, reject) => {
    execFile(
      PM2_CLI,
      ['jlist'],
      {
        env: { ...process.env, PM2_HOME },
        timeout: 5000,
        maxBuffer: 2 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr.trim() || error.message))

        try {
          const apps = JSON.parse(stdout)

          if (!Array.isArray(apps))
            throw new Error('PM2 returned a non-array process list')
          resolve(apps)
        } catch (parseError) {
          reject(parseError)
        }
      },
    )
  })
}

function start() {
  let apps = []
  let pollSuccess = false
  let lastSuccess = 0
  let polling = false
  let previousFailure

  async function refresh() {
    if (polling) return
    polling = true

    try {
      apps = await getProcessList()
      pollSuccess = true
      lastSuccess = Date.now() / 1000

      if (previousFailure) console.info('PM2 metadata polling recovered')
      previousFailure = undefined
    } catch (error) {
      pollSuccess = false
      const message = error instanceof Error ? error.message : String(error)

      if (message !== previousFailure)
        console.error(`PM2 metadata query failed: ${message}`)
      previousFailure = message
    } finally {
      polling = false
    }
  }

  const server = http.createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/metrics') {
      response.writeHead(404).end()

      return
    }

    response.writeHead(200, {
      'content-type': 'text/plain; version=0.0.4; charset=utf-8',
      'cache-control': 'no-store',
    })

    response.end(renderMetrics(apps, { pollSuccess, lastSuccess }))
  })

  server.listen(PORT, '127.0.0.1')
  void refresh()
  const poll = setInterval(() => void refresh(), POLL_INTERVAL_MS)
  poll.unref()
}

if (require.main === module) start()

module.exports = { renderMetrics }
