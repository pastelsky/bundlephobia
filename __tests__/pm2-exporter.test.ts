// SAFETY: This assertion matches the CommonJS export and is exercised below.
const { renderMetrics } =
  require('../operations/pm2-exporter/exporter.cjs') as {
    renderMetrics: (
      apps: unknown[],
      options: {
        pollSuccess: boolean
        lastSuccess: number
        now?: number
      },
    ) => string
  }

it('exports PM2 restart, state, uptime, CPU, and memory per process', () => {
  const metrics = renderMetrics(
    [
      {
        name: 'build-service',
        pm_id: 2,
        pm2_env: {
          status: 'online',
          pm_uptime: 100_000,
          restart_time: 4,
          unstable_restarts: 1,
        },
        monit: { cpu: 12.5, memory: 256 * 1024 * 1024 },
      },
      {
        name: 'bundlephobia-pm2-exporter',
        pm_id: 9,
        pm2_env: { status: 'online' },
      },
    ],
    { pollSuccess: true, lastSuccess: 125, now: 160_000 },
  )

  expect(metrics).toContain('bundlephobia_pm2_exporter_poll_success 1')
  expect(metrics).toContain(
    'bundlephobia_pm2_process_restarts_total{app="build-service",pm_id="2",worker="build-service #2"} 4',
  )
  expect(metrics).toContain(
    'bundlephobia_pm2_process_unstable_restarts_total{app="build-service",pm_id="2",worker="build-service #2"} 1',
  )
  expect(metrics).toContain(
    'bundlephobia_pm2_process_uptime_seconds{app="build-service",pm_id="2",worker="build-service #2"} 60',
  )
  expect(metrics).toContain(
    'bundlephobia_pm2_process_memory_bytes{app="build-service",pm_id="2",worker="build-service #2"} 268435456',
  )
  expect(metrics).toContain(
    'bundlephobia_pm2_process_cpu_percent{app="build-service",pm_id="2",worker="build-service #2"} 12.5',
  )
  expect(metrics).not.toContain('app="bundlephobia-pm2-exporter"')
})
