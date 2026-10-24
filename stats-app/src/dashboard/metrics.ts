import type { ChartCategory, ChartDefinition, ChartSeries } from './charts'
import {
  cpuUsage,
  memoryUsed,
  memoryTotal,
  hostCores,
  hostLoad,
  hostDisks,
  hostHealth,
} from './charts'

import type { DashboardSource } from './sources'
import {
  chartResolution,
  finiteValue,
  queryInstant,
  queryRange,
  stepSeconds,
  type TimeRange,
  type ChartRange,
} from '../lib/api'

const frontend = '{job="haproxy",proxy="bundlephobia_http"}'

const responseFrontend = '{job="haproxy",proxy="bundlephobia_http"}'

export interface ChartRow {
  timestamp: number
  time: string
  [key: string]: number | string | null
}

export async function loadPanel(
  panel: ChartDefinition,
  range: ChartRange,
  signal: AbortSignal,
) {
  const resolution = chartResolution(range.seconds, range.step)

  // Counter increases cover exactly one display interval. CPU rates retain a
  // wider minimum window to avoid noisy single-scrape rate calculations.
  const window =
    panel.measurement === 'counter'
      ? resolution.window
      : `${Math.max(300, resolution.step)}s`

  const end = Math.floor(Date.now() / 60000) * 60
  const queries = panel.series(window)

  const results = await Promise.all(
    queries.map(query =>
      queryRange(
        {
          expression: query.expression,
          seconds: range.seconds,
          end,
          step: resolution.step,
        },
        signal,
      ),
    ),
  )

  const accumulator: ChartAccumulator = {
    rows: new Map(),
    categories: [],
    hasData: false,
    formatter: new Intl.DateTimeFormat(
      undefined,
      range.seconds > 21600
        ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { hour: '2-digit', minute: '2-digit' },
    ),
  }

  for (const [index, seriesList] of results.entries()) {
    for (const series of seriesList)
      appendSeries(accumulator, queries[index], series)
  }

  return {
    data: chartTimeline(accumulator, range, end),
    ...visibleSeries(accumulator, queries),
    hasData: accumulator.hasData,
    resolution,
  }
}

interface ChartAccumulator {
  rows: Map<number, ChartRow>
  categories: string[]
  hasData: boolean
  formatter: Intl.DateTimeFormat
}

type MetricSeries = Awaited<ReturnType<typeof queryRange>>[number]

function appendSeries(
  accumulator: ChartAccumulator,
  query: ChartSeries,
  series: MetricSeries,
) {
  const name = seriesName(query, series)

  if (!accumulator.categories.includes(name)) accumulator.categories.push(name)

  for (const [timestamp, value] of series.values) {
    const row =
      accumulator.rows.get(timestamp) ?? chartRow(accumulator, timestamp)

    const numeric = finiteValue(value)

    if (numeric != null) accumulator.hasData = true
    row[name] = numeric
    accumulator.rows.set(timestamp, row)
  }
}

function seriesName(query: ChartSeries, series: MetricSeries) {
  if (!query.groupBy) return query.name

  const value = series.metric[query.groupBy.label] ?? 'other'

  return (
    query.groupBy.categories.find(
      category => (category.value ?? category.name) === value,
    )?.name ?? value
  )
}

// Grouped queries declare ordering and optional empty-series visibility alongside
// their expression. The renderer does not need to know which chart is loaded.
function categoryVisible(
  category: ChartCategory,
  accumulator: ChartAccumulator,
) {
  if (!accumulator.categories.includes(category.name)) return false

  if (!category.hideWhenZero) return true

  return [...accumulator.rows.values()].some(
    row => Number(row[category.name] ?? 0) > 0,
  )
}

function visibleSeries(accumulator: ChartAccumulator, queries: ChartSeries[]) {
  const categories: string[] = []
  const colors: string[] = []

  for (const query of queries) {
    for (const category of query.groupBy ? query.groupBy.categories : [query]) {
      if (
        !categoryVisible(category, accumulator) ||
        categories.includes(category.name)
      )
        continue

      categories.push(category.name)
      colors.push(category.color)
    }
  }

  return { categories, colors }
}

function chartRow(accumulator: ChartAccumulator, timestamp: number): ChartRow {
  return {
    timestamp,
    time: accumulator.formatter.format(new Date(timestamp * 1000)),
  }
}

function chartTimeline(
  accumulator: ChartAccumulator,
  range: ChartRange,
  end: number,
) {
  const data: ChartRow[] = []

  // Missing history stays missing: never turn scrape gaps into zero traffic.
  for (
    let timestamp = end - range.seconds;
    timestamp <= end;
    timestamp += stepSeconds(range.seconds, range.step)
  ) {
    const row =
      accumulator.rows.get(timestamp) ?? chartRow(accumulator, timestamp)

    for (const category of accumulator.categories) row[category] ??= null
    data.push(row)
  }

  return data
}

export async function loadSummary(range: TimeRange, signal: AbortSignal) {
  const duration = `${range.seconds}s`

  const queries = [
    `sum(increase(haproxy_frontend_http_requests_total${frontend}[${duration}]))`,
    `sum(rate(haproxy_frontend_http_requests_total${frontend}[5m]))`,
    `sum(haproxy_frontend_current_sessions${frontend})`,
    'min(up{job="haproxy"})',
    `sum by (code) (increase(haproxy_frontend_http_responses_total${responseFrontend}[${duration}]))`,
  ]

  const [requests, rate, sessions, health, responses] = await Promise.all(
    queries.map(query => queryInstant(query, signal)),
  )

  const scalar = (vector: typeof requests) =>
    vector[0] ? finiteValue(vector[0].value[1]) : null

  return {
    requests: scalar(requests),
    rate: scalar(rate),
    sessions: scalar(sessions),
    health: scalar(health),
    responses: responses.map(row => ({
      code: row.metric.code ?? 'other',
      count: finiteValue(row.value[1]),
    })),
  }
}

// Sum increases per worker, never increase a sum of counters: each PM2 worker
// resets independently. No package labels, log import, or browser-side storage.
export async function loadPipelineSummary(
  range: TimeRange,
  signal: AbortSignal,
) {
  const duration = `${range.seconds}s`

  const [builds, installs, buildHealth, installHealth, applicationHealth] =
    await Promise.all([
      queryInstant(
        `sum by (outcome) (increase(bundlephobia_builds_total{job="bundlephobia_builds"}[${duration}]))`,
        signal,
      ),
      queryInstant(
        `sum by (outcome) (increase(bundlephobia_installs_total{job="bundlephobia_installations"}[${duration}]))`,
        signal,
      ),
      queryInstant('min(up{job="bundlephobia_builds"})', signal),
      queryInstant('min(up{job="bundlephobia_installations"})', signal),
      queryInstant('min(up{job="bundlephobia_application"})', signal),
    ])

  const outcome = (rows: typeof builds, value: string) => {
    const row = rows.find(row => row.metric.outcome === value)

    return row ? finiteValue(row.value[1]) : null
  }

  const sources = [buildHealth, installHealth, applicationHealth]

  return {
    buildSuccess: outcome(builds, 'success'),
    buildFailure: outcome(builds, 'failure'),
    installSuccess: outcome(installs, 'success'),
    installFailure: outcome(installs, 'failure'),
    health: sources.every(rows => rows[0]?.value[1] === '1') ? 1 : null,
    configured: sources.every(rows => rows.length > 0),
  }
}

export async function loadResourceSummary(signal: AbortSignal) {
  const [cpu, cores, load, used, total, disks, health] = await Promise.all(
    [
      cpuUsage('5m'),
      hostCores,
      hostLoad('1m'),
      memoryUsed,
      memoryTotal,
      hostDisks,
      hostHealth,
    ].map(expression => queryInstant(expression, signal)),
  )

  const scalar = (rows: typeof cpu) =>
    rows[0] ? finiteValue(rows[0].value[1]) : null

  const diskValue = (mount: string, kind: string) => {
    const row = disks.find(
      row => row.metric.mount === mount && row.metric.kind === kind,
    )

    return row ? finiteValue(row.value[1]) : null
  }

  return {
    cpu: scalar(cpu),
    cores: scalar(cores),
    load: scalar(load),
    memoryUsed: scalar(used),
    memoryTotal: scalar(total),
    health: scalar(health),
    configured: health.length > 0,
    disks: ['root', 'builds', 'metrics'].map(mount => ({
      mount,
      total: diskValue(mount, 'total'),
      used: diskValue(mount, 'used'),
      available: diskValue(mount, 'available'),
    })),
  }
}

export async function loadPageSummary(
  source: DashboardSource,
  range: TimeRange,
  signal: AbortSignal,
) {
  switch (source) {
    case 'resources':
      return { source, data: await loadResourceSummary(signal) } as const
    case 'pipeline':
      return { source, data: await loadPipelineSummary(range, signal) } as const
    case 'haproxy':
      return { source, data: await loadSummary(range, signal) } as const
  }
}

export type PageSummary = Awaited<ReturnType<typeof loadPageSummary>>

export type SummaryData = Awaited<ReturnType<typeof loadSummary>>

export type ResourceData = Awaited<ReturnType<typeof loadResourceSummary>>
