import type { LineChartProps } from '@tremor/react'
import { formatBytes, numberFormat } from '../lib/format'

const frontend = '{job="haproxy",proxy="bundlephobia_http"}'

export interface ChartCategory {
  name: string
  color: string
  hideWhenZero?: boolean
}

// Grouped expressions must declare the label and its presentation together.
export type ChartSeries = { expression: string } & (
  | { name: string; color: string; groupBy?: never }
  | { groupBy: { label: string; categories: ChartCategory[] } }
)

type SeriesFactory = (window: string) => ChartSeries[]

export interface ChartCapacity {
  used: string
  total: string
  available?: string
  emptyLabel?: string
}

export interface ChartView {
  id: string
  title: string
  series: SeriesFactory
}

export interface ChartDefinition {
  id: string
  title: string
  description: string
  unit: string
  measurement?: 'counter'
  stacked?: boolean
  showShare?: boolean
  format: (value: number) => string
  series: SeriesFactory
  views?: ChartView[]
  capacity?: ChartCapacity
  chart?: Pick<LineChartProps, 'minValue' | 'maxValue' | 'allowDecimals'> & {
    type?: 'area' | 'line'
  }
}

// Each chart owns its queries, series labels, colors, and display options.
const traffic = {
  requests: {
    id: 'requests',
    title: 'Request traffic',
    description: 'Requests reaching the website',
    unit: 'requests',
    measurement: 'counter',
    format: value => numberFormat.format(value),
    series: window => [
      {
        expression: `sum(increase(haproxy_frontend_http_requests_total${frontend}[${window}]))`,
        name: 'Requests',
        color: 'orange',
      },
    ],
  },
  responses: {
    id: 'responses',
    title: 'Response health',
    description: 'Responses grouped by HTTP status class',
    unit: 'responses',
    measurement: 'counter',
    stacked: true,
    format: value => numberFormat.format(value),
    series: window => [
      {
        expression: `sum by (code) (increase(haproxy_frontend_http_responses_total${frontend}[${window}]))`,
        groupBy: {
          label: 'code',
          categories: [
            { name: '2xx', color: 'emerald' },
            { name: '3xx', color: 'sky' },
            { name: '4xx', color: 'amber' },
            { name: '5xx', color: 'rose' },
            { name: '1xx', color: 'slate', hideWhenZero: true },
            { name: 'other', color: 'stone', hideWhenZero: true },
          ],
        },
      },
    ],
  },
  bandwidth: {
    id: 'bandwidth',
    title: 'Network traffic',
    description: 'Data sent to and received from visitors',
    unit: 'bytes',
    measurement: 'counter',
    format: formatBytes,
    series: window => [
      {
        expression: `sum(increase(haproxy_frontend_bytes_out_total${frontend}[${window}]))`,
        name: 'Sent',
        color: 'sky',
      },
      {
        expression: `sum(increase(haproxy_frontend_bytes_in_total${frontend}[${window}]))`,
        name: 'Received',
        color: 'slate',
      },
    ],
  },
  sessions: {
    id: 'sessions',
    title: 'Open connections',
    description: 'Concurrent sessions at the public frontend',
    unit: 'sessions',
    chart: { allowDecimals: false },
    format: value => numberFormat.format(value),
    series: () => [
      {
        expression: `sum(haproxy_frontend_current_sessions${frontend})`,
        name: 'Sessions',
        color: 'slate',
      },
    ],
  },
} satisfies Record<string, ChartDefinition>

function outcomeChart(
  id: string,
  title: string,
  counter: { metric: string; job: string },
): ChartDefinition {
  const { metric, job } = counter

  return {
    id,
    title,
    description: 'Success and failure',
    unit: 'attempts',
    measurement: 'counter',
    stacked: true,
    showShare: true,
    format: value => numberFormat.format(value),
    series: window =>
      ['success', 'failure'].map(outcome => ({
        expression: `sum(increase(${metric}{job="${job}",outcome="${outcome}"}[${window}]))`,
        name: outcome === 'success' ? 'Success' : 'Failure',
        color: outcome === 'success' ? 'emerald' : 'rose',
      })),
  }
}

const cacheMetric =
  'bundlephobia_analysis_responses_total{job="bundlephobia_application"}'

function cacheChart(percentage: boolean): ChartDefinition {
  return {
    id: percentage ? 'cache-share' : 'cache-responses',
    title: percentage ? 'Cache coverage' : 'Cache responses',
    description: 'Successful origin responses',
    unit: percentage ? '%' : 'responses',
    measurement: 'counter',
    stacked: true,
    showShare: !percentage,
    format: value =>
      percentage
        ? `${numberFormat.format(value)}%`
        : numberFormat.format(value),
    chart: percentage ? { maxValue: 100 } : {},
    series: window =>
      ['hit', 'miss'].map(cache => {
        const count = `sum(increase(bundlephobia_analysis_responses_total{job="bundlephobia_application",cache="${cache}"}[${window}]))`

        return {
          expression: percentage
            ? `100 * (${count}) / sum(increase(${cacheMetric}[${window}]))`
            : count,
          name: cache === 'hit' ? 'Cached' : 'Computed',
          color: cache === 'hit' ? 'emerald' : 'orange',
        }
      }),
  }
}

function durationChart(
  id: string,
  title: string,
  metric: string,
): ChartDefinition {
  return {
    id,
    title,
    description: 'p50, p95 and p99 · uncached work',
    unit: 'seconds',
    chart: { type: 'line' },
    format: value =>
      value < 1
        ? `${numberFormat.format(value * 1000)} ms`
        : `${numberFormat.format(value)} s`,
    series: window =>
      [
        { quantile: 0.5, name: 'p50', color: 'sky' },
        { quantile: 0.95, name: 'p95', color: 'orange' },
        { quantile: 0.99, name: 'p99', color: 'rose' },
      ].map(({ quantile, name, color }) => ({
        name,
        color,
        expression: `histogram_quantile(${quantile}, sum by (le) (rate(${metric}_bucket[${window}])))`,
      })),
  }
}

function queueChart(state: 'waiting' | 'running'): ChartDefinition {
  return {
    id: `queue-${state}`,
    title: state === 'waiting' ? 'Queue backlog' : 'Work in progress',
    description:
      state === 'waiting'
        ? 'Jobs waiting for a worker'
        : 'Jobs currently running',
    unit: 'jobs',
    chart: { type: 'line', allowDecimals: false },
    format: value => numberFormat.format(value),
    series: () => [
      {
        expression: `sum(bundlephobia_queue_jobs{job="bundlephobia_application",queue="analysis",state="${state}"})`,
        name: 'Analysis',
        color: 'orange',
      },
      {
        expression: `sum(bundlephobia_queue_jobs{job="bundlephobia_installations",queue="installations",state="${state}"})`,
        name: 'Installations',
        color: 'violet',
      },
    ],
  }
}

const pipeline = {
  queueBacklog: queueChart('waiting'),
  queueRunning: queueChart('running'),
  cacheShare: cacheChart(true),
  cacheResponses: cacheChart(false),
  builds: outcomeChart('build-outcomes', 'Build outcomes', {
    metric: 'bundlephobia_builds_total',
    job: 'bundlephobia_builds',
  }),
  installs: outcomeChart('install-outcomes', 'Installation outcomes', {
    metric: 'bundlephobia_installs_total',
    job: 'bundlephobia_installations',
  }),
  buildDuration: durationChart(
    'build-duration',
    'Build duration',
    'bundlephobia_build_duration_seconds',
  ),
  installDuration: durationChart(
    'install-duration',
    'Installation duration',
    'bundlephobia_install_duration_seconds',
  ),
}

const hostJob = 'job="bundlephobia_host"'

const legacyHostJob = 'job="bundlephobia_installations"'

// Prefer standard exporter samples while preserving history from the preview's
// old sampler. Apply fallback after rates: CPU ticks and seconds cannot mix.
const hostHistory = (current: string, previous: string) =>
  `(${current}) or on() (${previous})`

export const cpuUsage = (window: string) =>
  hostHistory(
    `100 * (1 - sum(rate(node_cpu_seconds_total{${hostJob},mode=~"idle|iowait"}[${window}])) / sum(rate(node_cpu_seconds_total{${hostJob}}[${window}])))`,
    `100 * (1 - sum(rate(bundlephobia_host_cpu_ticks_total{${legacyHostJob},mode=~"idle|iowait"}[${window}])) / sum(rate(bundlephobia_host_cpu_ticks_total{${legacyHostJob}}[${window}])))`,
  )

export const hostCores = hostHistory(
  `count(node_cpu_seconds_total{${hostJob},mode="idle"})`,
  `bundlephobia_host_cpu_cores{${legacyHostJob}}`,
)

const loadMetrics = {
  '1m': 'node_load1',
  '5m': 'node_load5',
  '15m': 'node_load15',
} as const

export const hostLoad = (period: keyof typeof loadMetrics) =>
  hostHistory(
    `sum(${loadMetrics[period]}{${hostJob}})`,
    `bundlephobia_host_load{${legacyHostJob},period="${period}"}`,
  )

export const hostMemory = (field: string, legacyKind: string) =>
  hostHistory(
    `sum(node_memory_${field}_bytes{${hostJob}})`,
    `sum(bundlephobia_host_memory_bytes{${legacyHostJob},kind="${legacyKind}"})`,
  )

export const memoryTotal = hostMemory('MemTotal', 'total')

export const memoryUsed = `(${memoryTotal}) - (${hostMemory('MemAvailable', 'available')})`

const swapTotal = hostMemory('SwapTotal', 'swap_total')

const swapUsed = `(${swapTotal}) - (${hostMemory('SwapFree', 'swap_free')})`

const mounts = [
  { id: 'root', title: 'Main disk', path: '/' },
  { id: 'builds', title: 'Builds', path: '/tmp/tmp-build' },
  {
    id: 'metrics',
    title: 'Metrics',
    path: '/var/lib/bundlephobia-victoriametrics',
  },
] as const

const diskSeries = [
  { kind: 'used', field: 'size', name: 'Used', color: 'orange' },
  { kind: 'total', field: 'size', name: 'Capacity', color: 'slate' },
  { kind: 'available', field: 'avail', name: 'Available', color: 'emerald' },
] as const

function hostDisk(
  mount: (typeof mounts)[number],
  series: (typeof diskSeries)[number],
) {
  const selector = `{${hostJob},mountpoint="${mount.path}"}`
  const value = `sum(node_filesystem_${series.field}_bytes${selector})`

  const current =
    series.kind === 'used'
      ? `${value} - sum(node_filesystem_free_bytes${selector})`
      : value

  return hostHistory(
    current,
    `bundlephobia_host_disk_bytes{${legacyHostJob},mount="${mount.id}",kind="${series.kind}"}`,
  )
}

export const hostDisks = mounts
  .flatMap(mount =>
    diskSeries.map(
      series =>
        `label_set((${hostDisk(mount, series)}), "mount", "${mount.id}", "kind", "${series.kind}")`,
    ),
  )
  .join(' or ')

export const hostHealth = hostHistory(
  `min(up{${hostJob}}) * (min(node_scrape_collector_success{${hostJob}}) or on() vector(0))`,
  `min(bundlephobia_host_collection_success{${legacyHostJob}})`,
)

// Keep capacity as a sampled series: a resized filesystem must not rewrite
// the capacity shown for older points. Mounts use separate scales.
const diskViews: ChartView[] = mounts.map(mount => ({
  id: mount.id,
  title: mount.title,
  series: () =>
    diskSeries.map(series => ({
      expression: hostDisk(mount, series),
      name: series.name,
      color: series.color,
    })),
}))

const resources = {
  cpu: {
    id: 'host-cpu',
    title: 'CPU usage',
    description: 'Busy time across all cores · excludes idle and I/O wait',
    unit: '%',
    chart: { minValue: 0, maxValue: 100 },
    format: value => `${numberFormat.format(value)}%`,
    series: window => [
      { expression: cpuUsage(window), name: 'CPU', color: 'orange' },
    ],
  },
  load: {
    id: 'host-load',
    title: 'CPU load',
    chart: { type: 'line' },
    description: 'Runnable and waiting tasks · compare with CPU core count',
    unit: 'tasks',
    format: value => numberFormat.format(value),
    series: () => [
      ...(
        [
          ['1m', 'orange'],
          ['5m', 'sky'],
          ['15m', 'violet'],
        ] as const
      ).map(([period, color]) => ({
        color,
        expression: hostLoad(period),
        name: period,
      })),
      {
        expression: hostCores,
        name: 'Cores',
        color: 'slate',
      },
    ],
  },
  memory: {
    id: 'host-memory',
    title: 'Memory usage',
    chart: { type: 'line' },
    capacity: { used: 'Used', total: 'Total' },
    description: 'RAM in use · reclaimable filesystem cache is available',
    unit: 'bytes',
    format: formatBytes,
    series: () => [
      { expression: memoryUsed, name: 'Used', color: 'violet' },
      {
        expression: memoryTotal,
        name: 'Total',
        color: 'slate',
      },
    ],
  },
  disk: {
    id: 'host-disk',
    title: 'Disk usage',
    description:
      'Used, available, and total capacity for the selected filesystem',
    unit: 'bytes',
    chart: { type: 'line' },
    capacity: { used: 'Used', total: 'Capacity', available: 'Available' },
    format: formatBytes,
    series: diskViews[0].series,
    views: diskViews,
  },
  network: {
    id: 'host-network',
    title: 'Host network traffic',
    description: 'Interface traffic · excludes loopback and virtual bridges',
    unit: 'bytes',
    measurement: 'counter',
    format: formatBytes,
    series: window =>
      ['receive', 'transmit'].map(direction => ({
        expression: hostHistory(
          `sum(increase(node_network_${direction}_bytes_total{${hostJob}}[${window}]))`,
          `sum(increase(bundlephobia_host_network_bytes_total{${legacyHostJob},direction="${direction}"}[${window}]))`,
        ),
        name: direction === 'receive' ? 'Received' : 'Sent',
        color: direction === 'receive' ? 'sky' : 'orange',
      })),
  },
  swap: {
    id: 'host-swap',
    title: 'Swap usage',
    chart: { type: 'line' },
    capacity: {
      used: 'Used',
      total: 'Total',
      emptyLabel: 'No swap configured',
    },
    description: 'Swap space in use and total swap capacity',
    unit: 'bytes',
    format: formatBytes,
    series: () => [
      {
        expression: swapUsed,
        name: 'Used',
        color: 'rose',
      },
      {
        expression: swapTotal,
        name: 'Total',
        color: 'slate',
      },
    ],
  },
} satisfies Record<string, ChartDefinition>

export const CHARTS = { ...traffic, ...pipeline, ...resources }
