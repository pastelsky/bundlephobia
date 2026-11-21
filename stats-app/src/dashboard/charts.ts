import type { LineChartProps } from '@tremor/react'
import { formatBytes, numberFormat } from '../lib/format'

const frontend = '{job="haproxy",proxy="bundlephobia_http"}'

export interface ChartCategory {
  name: string
  value?: string
  color: string
  hideWhenZero?: boolean
}

// Grouped queries can use returned labels and automatic colors.
export type ChartSeries = { expression: string } & (
  | { name: string; color: string; groupBy?: never }
  | { groupBy: { label: string; categories?: ChartCategory[] } }
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
  presentation?: Partial<
    Pick<ChartDefinition, 'unit' | 'format' | 'chart' | 'showShare'>
  >
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
  chart?: Pick<
    LineChartProps,
    'minValue' | 'maxValue' | 'allowDecimals' | 'autoMinValue'
  > & {
    type?: 'area' | 'line'
  }
}

const formatBytesPerSecond = (value: number) => `${formatBytes(value)}/s`

// Each chart owns its queries, series labels, colors, and display options.
const traffic = {
  requests: {
    id: 'requests',
    title: 'Request traffic',
    description: 'Requests per minute reaching the website',
    unit: 'req/min',
    format: value => numberFormat.format(value),
    series: window => [
      {
        expression: `sum(rate(haproxy_frontend_http_requests_total${frontend}[${window}])) * 60`,
        name: 'Requests',
        color: 'orange',
      },
    ],
  },
  responses: {
    id: 'responses',
    title: 'Response health',
    description: 'Responses per minute grouped by HTTP status class',
    unit: 'resp/min',
    stacked: true,
    format: value => numberFormat.format(value),
    series: window => [
      {
        expression: `sum by (code) (rate(haproxy_frontend_http_responses_total${frontend}[${window}])) * 60`,
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
  errorRate: {
    id: 'error-rate',
    title: 'HTTP error rate',
    description: 'Percentage of responses returning 5xx or 4xx',
    unit: '%',
    chart: { type: 'line', minValue: 0 },
    format: value => `${numberFormat.format(value)}%`,
    series: window => {
      const total = `sum(rate(haproxy_frontend_http_responses_total${frontend}[${window}]))`

      return [
        {
          expression: `100 * sum(rate(haproxy_frontend_http_responses_total{job="haproxy",proxy="bundlephobia_http",code="5xx"}[${window}])) / (${total} > 0)`,
          name: '5xx %',
          color: 'rose',
        },
        {
          expression: `100 * sum(rate(haproxy_frontend_http_responses_total{job="haproxy",proxy="bundlephobia_http",code="4xx"}[${window}])) / (${total} > 0)`,
          name: '4xx %',
          color: 'amber',
        },
      ]
    },
  },
  bandwidth: {
    id: 'bandwidth',
    title: 'Network traffic',
    description: 'Throughput sent to and received from visitors',
    unit: 'bytes/s',
    format: formatBytesPerSecond,
    series: window => [
      {
        expression: `sum(rate(haproxy_frontend_bytes_out_total${frontend}[${window}]))`,
        name: 'Sent',
        color: 'sky',
      },
      {
        expression: `sum(rate(haproxy_frontend_bytes_in_total${frontend}[${window}]))`,
        name: 'Received',
        color: 'slate',
      },
    ],
  },
  sessions: {
    id: 'sessions',
    title: 'Open connections',
    description: 'Peak concurrent sessions at the public frontend',
    unit: 'sessions',
    chart: { allowDecimals: false },
    format: value => numberFormat.format(value),
    series: window => [
      {
        expression: `sum(max_over_time(haproxy_frontend_current_sessions${frontend}[${window}]))`,
        name: 'Peak sessions',
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
    description: 'Success and failure rate per minute',
    unit: 'attempts/min',
    stacked: true,
    showShare: true,
    format: value => numberFormat.format(value),
    series: window =>
      ['success', 'failure'].map(outcome => ({
        expression: `sum(rate(${metric}{job="${job}",outcome="${outcome}"}[${window}])) * 60`,
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
    description: percentage
      ? 'Percentage of successful responses served from cache'
      : 'Successful origin responses per minute',
    unit: percentage ? '%' : 'resp/min',
    stacked: true,
    showShare: !percentage,
    format: value =>
      percentage
        ? `${numberFormat.format(value)}%`
        : numberFormat.format(value),
    chart: percentage ? { maxValue: 100 } : {},
    series: window =>
      ['hit', 'miss'].map(cache => {
        const rate = `sum(rate(bundlephobia_analysis_responses_total{job="bundlephobia_application",cache="${cache}"}[${window}]))`

        return {
          expression: percentage
            ? `100 * (${rate}) / (sum(rate(${cacheMetric}[${window}])) > 0)`
            : `(${rate}) * 60`,
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
    description: 'p50, p90, p95 and p99 · uncached work',
    unit: 'seconds',
    chart: { type: 'line' },
    format: value =>
      value === 0
        ? '0 s'
        : value < 1
          ? `${numberFormat.format(value * 1000)} ms`
          : `${numberFormat.format(value)} s`,
    series: window =>
      [
        { quantile: 0.5, name: 'p50', color: 'sky' },
        { quantile: 0.9, name: 'p90', color: 'amber' },
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
        ? 'Peak jobs waiting for a worker'
        : 'Peak jobs running concurrently',
    unit: 'jobs',
    chart: { type: 'line', allowDecimals: false },
    format: value => numberFormat.format(value),
    series: window => [
      {
        expression: `sum(max_over_time(bundlephobia_queue_jobs{job="bundlephobia_application",queue="analysis",state="${state}"}[${window}]))`,
        name: 'Analysis',
        color: 'orange',
      },
      {
        expression: `sum(max_over_time(bundlephobia_queue_jobs{job="bundlephobia_installations",queue="installations",state="${state}"}[${window}]))`,
        name: 'Installations',
        color: 'violet',
      },
    ],
  }
}

const buildRequestMetric =
  'bundlephobia_analysis_requests_total{job="bundlephobia_application",build_requested="true"}'

function buildRequestSeries(percentage: boolean): SeriesFactory {
  return window => {
    const rate = `sum by (client_family) (rate(${buildRequestMetric}[${window}]))`

    return [
      {
        expression: percentage
          ? `100 * (${rate}) / ignoring(client_family) group_left (sum(${rate}) > 0)`
          : `(${rate}) * 60`,
        groupBy: {
          label: 'client_family',
          categories: [
            { value: 'google', name: 'Google', color: 'orange' },
            { value: 'bytedance', name: 'ByteDance', color: 'sky' },
            { value: 'baidu', name: 'Baidu', color: 'emerald' },
            { value: 'openai', name: 'OpenAI', color: 'violet' },
            { value: 'anthropic', name: 'Anthropic', color: 'rose' },
            { value: 'amazon', name: 'Amazon', color: 'amber' },
            { value: 'shields', name: 'Shields', color: 'teal' },
            {
              value: 'headed_browser',
              name: 'Headed browsers',
              color: 'indigo',
            },
            {
              value: 'headless_browser',
              name: 'Headless browsers',
              color: 'pink',
            },
            { value: 'http_client', name: 'HTTP clients', color: 'lime' },
            { value: 'other_bot', name: 'Other bots', color: 'slate' },
            { value: 'other', name: 'Other', color: 'stone' },
            { value: 'unknown', name: 'Unknown', color: 'zinc' },
          ].map(category => ({ ...category, hideWhenZero: true })),
        },
      },
    ]
  }
}

const buildRequests: ChartDefinition = {
  id: 'build-requests-by-client',
  title: 'Build requests by client',
  description: 'Uncached analysis requests per minute · grouped by client',
  unit: 'req/min',
  stacked: true,
  showShare: true,
  format: value => numberFormat.format(value),
  series: buildRequestSeries(false),
  views: [
    { id: 'counts', title: 'Rate', series: buildRequestSeries(false) },
    {
      id: 'share',
      title: 'Percentage',
      presentation: {
        unit: '%',
        format: value => `${numberFormat.format(value)}%`,
        chart: { maxValue: 100 },
        showShare: false,
      },
      series: buildRequestSeries(true),
    },
  ],
}

const buildFailures: ChartDefinition = {
  id: 'build-failure-reasons',
  title: 'Build failure reasons',
  description: 'Failures per minute grouped by error code',
  unit: 'failures/min',
  stacked: true,
  showShare: true,
  format: value => numberFormat.format(value),
  series: window => [
    {
      expression: `sum by (code) (rate(bundlephobia_build_failures_total{job="bundlephobia_builds"}[${window}])) * 60`,
      groupBy: { label: 'code' },
    },
  ],
}

const pipeline = {
  buildRequests,
  buildFailures,
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

const cpuModePercent = (mode: string, window: string) =>
  hostHistory(
    `100 * sum(rate(node_cpu_seconds_total{${hostJob},mode="${mode}"}[${window}])) / sum(rate(node_cpu_seconds_total{${hostJob}}[${window}]))`,
    `100 * sum(rate(bundlephobia_host_cpu_ticks_total{${legacyHostJob},mode="${mode}"}[${window}])) / sum(rate(bundlephobia_host_cpu_ticks_total{${legacyHostJob}}[${window}]))`,
  )

const resources = {
  hostCpu: {
    id: 'host-cpu',
    title: 'Host CPU usage',
    description: 'User, system (kernel), and I/O wait across all cores',
    unit: '%',
    stacked: true,
    chart: { minValue: 0, maxValue: 100 },
    format: value => `${numberFormat.format(value)}%`,
    series: window => [
      {
        expression: cpuModePercent('user', window),
        name: 'User',
        color: 'orange',
      },
      {
        expression: cpuModePercent('system', window),
        name: 'System',
        color: 'rose',
      },
      {
        expression: cpuModePercent('iowait', window),
        name: 'I/O wait',
        color: 'amber',
      },
    ],
  },
  ioWait: {
    id: 'host-io-wait',
    title: 'I/O wait',
    description: 'CPU time waiting for I/O across all cores',
    unit: '%',
    chart: { minValue: 0, maxValue: 100 },
    format: value => `${numberFormat.format(value)}%`,
    series: window => [
      {
        expression: cpuModePercent('iowait', window),
        name: 'I/O wait',
        color: 'amber',
      },
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
  hostMemory: {
    id: 'host-memory',
    title: 'Host memory usage',
    chart: { type: 'line' },
    capacity: { used: 'Used (peak)', total: 'Total' },
    description: 'Peak RAM in use · reclaimable filesystem cache is available',
    unit: 'bytes',
    format: formatBytes,
    series: window => [
      {
        expression: `max_over_time((${memoryUsed})[${window}:1m])`,
        name: 'Used (peak)',
        color: 'violet',
      },
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
  diskIo: {
    id: 'host-disk-io',
    title: 'Disk I/O throughput',
    description: 'Read, write, and discard throughput on vda and loop5',
    unit: 'bytes/s',
    chart: { type: 'line' },
    format: formatBytesPerSecond,
    series: window => [
      {
        expression: `sum(rate(node_disk_written_bytes_total{${hostJob},device=~"vda|loop5"}[${window}]))`,
        name: 'Write',
        color: 'orange',
      },
      {
        expression: `sum(rate(node_disk_read_bytes_total{${hostJob},device=~"vda|loop5"}[${window}]))`,
        name: 'Read',
        color: 'sky',
      },
      {
        expression: `sum(rate(node_disk_discarded_bytes_total{${hostJob},device=~"vda|loop5"}[${window}]))`,
        name: 'Discard',
        color: 'amber',
      },
    ],
  },
  network: {
    id: 'host-network',
    title: 'Host network throughput',
    description: 'Interface throughput · excludes loopback and virtual bridges',
    unit: 'bytes/s',
    format: formatBytesPerSecond,
    series: window =>
      ['receive', 'transmit'].map(direction => ({
        expression: hostHistory(
          `sum(rate(node_network_${direction}_bytes_total{${hostJob}}[${window}]))`,
          `sum(rate(bundlephobia_host_network_bytes_total{${legacyHostJob},direction="${direction}"}[${window}]))`,
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
      used: 'Used (peak)',
      total: 'Total',
      emptyLabel: 'No swap configured',
    },
    description: 'Peak swap space in use and total swap capacity',
    unit: 'bytes',
    format: formatBytes,
    series: window => [
      {
        expression: `max_over_time((${swapUsed})[${window}:1m])`,
        name: 'Used (peak)',
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

const pm2Job = 'job="bundlephobia_pm2"'

const pm2 = {
  restarts: {
    id: 'pm2-restarts',
    title: 'Worker restarts',
    description: 'Restart count changes for each PM2 process in each interval',
    unit: 'restarts',
    measurement: 'counter',
    chart: { type: 'line', allowDecimals: false },
    format: value => numberFormat.format(value),
    series: window => [
      {
        expression: `label_join(clamp_min(delta(pm2_app_restart_count{${pm2Job}}[${window}]), 0), "worker", " #", "app", "instance")`,
        groupBy: { label: 'worker' },
      },
    ],
  },
  availability: {
    id: 'pm2-availability',
    title: 'Worker status',
    description: 'PM2 status for each worker process',
    unit: 'status',
    chart: { type: 'line', minValue: 0, maxValue: 4, allowDecimals: false },
    format: value =>
      ['Unknown', 'Running', 'Pending', 'Stopped', 'Errored'][
        Math.round(value)
      ] ?? 'Unknown',
    series: () => [
      {
        expression: `label_join(pm2_app_status{${pm2Job}}, "worker", " #", "app", "instance")`,
        groupBy: { label: 'worker' },
      },
    ],
  },
  uptime: {
    id: 'pm2-uptime',
    title: 'Worker uptime',
    description: 'Time since PM2 last started each worker process',
    unit: 'hours',
    chart: { type: 'line' },
    format: value => `${numberFormat.format(value / 3600)} h`,
    series: () => [
      {
        expression: `label_join(pm2_app_uptime{${pm2Job}}, "worker", " #", "app", "instance")`,
        groupBy: { label: 'worker' },
      },
    ],
  },
  pm2Cpu: {
    id: 'pm2-cpu',
    title: 'Worker CPU',
    description: 'Peak CPU utilization per worker reported by PM2',
    unit: '%',
    chart: { type: 'line', minValue: 0, maxValue: 100 },
    format: value => `${numberFormat.format(value)}%`,
    series: window => [
      {
        expression: `label_join(max_over_time(pm2_app_pids_cpu{${pm2Job}}[${window}]), "worker", " #", "app", "instance")`,
        groupBy: { label: 'worker' },
      },
    ],
  },
  pm2Memory: {
    id: 'pm2-memory',
    title: 'Worker memory',
    description: 'Peak resident memory per worker reported by PM2',
    unit: 'bytes',
    chart: { type: 'line' },
    format: formatBytes,
    series: window => [
      {
        expression: `label_join(max_over_time(pm2_app_pids_memory{${pm2Job}}[${window}]), "worker", " #", "app", "instance")`,
        groupBy: { label: 'worker' },
      },
    ],
  },
} satisfies Record<string, ChartDefinition>

export const CHARTS = { ...traffic, ...pipeline, ...resources, ...pm2 }
