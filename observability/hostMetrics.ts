import fs from 'node:fs/promises'
import os from 'node:os'
import { Counter, Gauge, type Registry } from 'prom-client'

// Read a handful of kernel counters once per scrape, inside an existing process.
// No interval, subprocess, recursive disk scan, or per-process/package labels.
export function createHostMetrics(registry: Registry) {
  const gauge = (name: string, labels: string[]) =>
    new Gauge({
      name: `bundlephobia_host_${name}`,
      help: `Host ${name.replaceAll('_', ' ')}.`,
      labelNames: labels,
      registers: [registry],
    })

  const counter = (name: string, labels: string[]) =>
    new Counter({
      name: `bundlephobia_host_${name}`,
      help: `Host cumulative ${name.replaceAll('_', ' ')}.`,
      labelNames: labels,
      registers: [registry],
    })

  const cpu = counter('cpu_ticks_total', ['mode'])
  const cores = gauge('cpu_cores', [])
  const load = gauge('load', ['period'])
  const uptime = gauge('uptime_seconds', [])
  const memory = gauge('memory_bytes', ['kind'])
  const disk = gauge('disk_bytes', ['mount', 'kind'])
  const network = counter('network_bytes_total', ['direction'])
  const success = gauge('collection_success', ['collector'])

  const collectors = [
    {
      name: 'cpu',
      metrics: [cpu, cores, load, uptime],
      async collect() {
        const stat = await fs.readFile('/proc/stat', 'utf8')

        const ticks = stat
          .split('\n')[0]
          .trim()
          .split(/\s+/)
          .slice(1)
          .map(Number)

        const modes = [
          'user',
          'nice',
          'system',
          'idle',
          'iowait',
          'irq',
          'softirq',
          'steal',
        ]

        // Linux includes guest time in user/nice already: do not count it twice.
        for (const [index, mode] of modes.entries())
          cpu.inc({ mode }, ticks[index])
        cores.set(stat.match(/^cpu\d+\s/gm)?.length ?? 0)

        for (const [index, period] of ['1m', '5m', '15m'].entries())
          load.set({ period }, os.loadavg()[index])
        uptime.set(os.uptime())
      },
    },
    {
      name: 'memory',
      metrics: [memory],
      async collect() {
        const info = await fs.readFile('/proc/meminfo', 'utf8')

        for (const [field, kind] of [
          ['MemTotal', 'total'],
          ['MemAvailable', 'available'],
          ['SwapTotal', 'swap_total'],
          ['SwapFree', 'swap_free'],
        ]) {
          const value = info.match(new RegExp(`^${field}:\\s+(\\d+)`, 'm'))?.[1]

          if (value === undefined) throw new Error(`Missing ${field}`)
          // MemAvailable counts reclaimable cache; MemFree alone overstates use.
          memory.set({ kind }, Number(value) * 1024)
        }
      },
    },
    {
      name: 'disk',
      metrics: [disk],
      async collect() {
        for (const [mount, directory] of [
          ['root', '/'],
          ['builds', process.env.BUILD_TMP_DIR || '/tmp/tmp-build'],
          ['metrics', '/var/lib/bundlephobia-victoriametrics'],
        ]) {
          const stat = await fs.statfs(directory)
          disk.set({ mount, kind: 'total' }, stat.blocks * stat.bsize)
          disk.set({ mount, kind: 'available' }, stat.bavail * stat.bsize)
          disk.set(
            { mount, kind: 'used' },
            (stat.blocks - stat.bfree) * stat.bsize,
          )
        }
      },
    },
    {
      name: 'network',
      metrics: [network],
      async collect() {
        const info = await fs.readFile('/proc/net/dev', 'utf8')
        let receive = 0
        let transmit = 0

        for (const line of info.trim().split('\n').slice(2)) {
          const [device, data] = line.split(':')

          // Exclude loopback and virtual bridges to avoid counting local traffic
          // twice. Aggregate remaining interfaces into two bounded series.
          if (/^(lo$|veth|docker|br-|virbr|tun|tap)/.test(device.trim()))
            continue
          const values = data.trim().split(/\s+/).map(Number)
          receive += values[0]
          transmit += values[8]
        }

        network.inc({ direction: 'receive' }, receive)
        network.inc({ direction: 'transmit' }, transmit)
      },
    },
  ]

  let pending: Promise<void> | undefined

  return function collect() {
    if (pending) return pending
    pending = (async () => {
      const results = await Promise.allSettled(
        collectors.map(async collector => {
          // Counters are absolute boot/interface totals, not process-lifetime
          // deltas, so restarting the installer does not reset host CPU/network.
          for (const metric of collector.metrics) metric.reset()
          await collector.collect()
        }),
      )

      for (const [index, result] of results.entries()) {
        const collector = collectors[index]

        if (result.status === 'rejected') {
          // Failed readings must disappear instead of retaining stale values.
          for (const metric of collector.metrics) metric.reset()
        }

        success.set(
          { collector: collector.name },
          result.status === 'fulfilled' ? 1 : 0,
        )
      }
    })().finally(() => {
      pending = undefined
    })

    return pending
  }
}
