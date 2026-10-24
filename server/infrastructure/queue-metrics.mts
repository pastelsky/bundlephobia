import { Gauge, type Registry } from 'prom-client'

interface QueueSnapshot {
  ready: number
  running: number
}

// Read the existing queue only when scraped: no timer or retained job history.
export function registerQueueMetrics(
  registry: Registry,
  queue: 'analysis' | 'installations',
  snapshot: () => QueueSnapshot,
) {
  return new Gauge({
    name: 'bundlephobia_queue_jobs',
    help: 'Jobs waiting for or occupying a queue worker.',
    labelNames: ['queue', 'state'],
    registers: [registry],
    collect() {
      const { ready, running } = snapshot()

      this.set({ queue, state: 'waiting' }, ready)
      this.set({ queue, state: 'running' }, running)
    },
  })
}
