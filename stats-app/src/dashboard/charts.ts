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
  stacked?: boolean
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
    unit: 'requests / sec',
    format: value => numberFormat.format(value),
    series: window => [
      {
        expression: `sum(rate(haproxy_frontend_http_requests_total${frontend}[${window}]))`,
        name: 'Requests',
        color: 'orange',
      },
    ],
  },
  responses: {
    id: 'responses',
    title: 'Response health',
    description: 'Responses grouped by HTTP status class',
    unit: 'responses / sec',
    stacked: true,
    format: value => numberFormat.format(value),
    series: window => [
      {
        expression: `sum by (code) (rate(haproxy_frontend_http_responses_total${frontend}[${window}]))`,
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
    unit: 'bytes / sec',
    format: formatBytes,
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
    description: 'Completed attempts · success versus failure',
    unit: 'attempts / min',
    format: value => numberFormat.format(value),
    series: window =>
      ['success', 'failure'].map(outcome => ({
        expression: `sum(rate(${metric}{job="${job}",outcome="${outcome}"}[${window}])) * 60`,
        name: outcome === 'success' ? 'Success' : 'Failure',
        color: outcome === 'success' ? 'emerald' : 'rose',
      })),
  }
}

const pipeline = {
  builds: outcomeChart('build-outcomes', 'Build outcomes', {
    metric: 'bundlephobia_builds_total',
    job: 'bundlephobia_builds',
  }),
  installs: outcomeChart('install-outcomes', 'Installation outcomes', {
    metric: 'bundlephobia_installs_total',
    job: 'bundlephobia_installations',
  }),
}

export const hostJob = 'job="bundlephobia_installations"'

export const cpuUsage = (window: string) =>
  `100 * (1 - sum(rate(bundlephobia_host_cpu_ticks_total{${hostJob},mode=~"idle|iowait"}[${window}])) / sum(rate(bundlephobia_host_cpu_ticks_total{${hostJob}}[${window}])))`

export const memoryUsed = `bundlephobia_host_memory_bytes{${hostJob},kind="total"} - ignoring(kind) bundlephobia_host_memory_bytes{${hostJob},kind="available"}`

// Keep capacity as a sampled series: a resized filesystem must not rewrite
// the capacity shown for older points. Mounts use separate scales.
const diskViews: ChartView[] = [
  ['root', 'Main disk'],
  ['builds', 'Builds'],
  ['metrics', 'Metrics'],
].map(([id, title]) => ({
  id,
  title,
  series: () =>
    [
      ['used', 'Used', 'orange'],
      ['total', 'Capacity', 'slate'],
      ['available', 'Available', 'emerald'],
    ].map(([kind, name, color]) => ({
      expression: `bundlephobia_host_disk_bytes{${hostJob},mount="${id}",kind="${kind}"}`,
      name,
      color,
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
      ...[
        ['1m', 'orange'],
        ['5m', 'sky'],
        ['15m', 'violet'],
      ].map(([period, color]) => ({
        color,
        expression: `bundlephobia_host_load{${hostJob},period="${period}"}`,
        name: period,
      })),
      {
        expression: `bundlephobia_host_cpu_cores{${hostJob}}`,
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
        expression: `bundlephobia_host_memory_bytes{${hostJob},kind="total"}`,
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
    unit: 'bytes / sec',
    format: formatBytes,
    series: window =>
      ['receive', 'transmit'].map(direction => ({
        expression: `sum(rate(bundlephobia_host_network_bytes_total{${hostJob},direction="${direction}"}[${window}]))`,
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
        expression: `bundlephobia_host_memory_bytes{${hostJob},kind="swap_total"} - ignoring(kind) bundlephobia_host_memory_bytes{${hostJob},kind="swap_free"}`,
        name: 'Used',
        color: 'rose',
      },
      {
        expression: `bundlephobia_host_memory_bytes{${hostJob},kind="swap_total"}`,
        name: 'Total',
        color: 'slate',
      },
    ],
  },
} satisfies Record<string, ChartDefinition>

export const CHARTS = { ...traffic, ...pipeline, ...resources }
