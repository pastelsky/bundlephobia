import {
  finiteValue,
  queryInstant,
  queryRange,
  stepSeconds,
  type TimeRange,
} from './api'

const frontend = '{job="haproxy",proxy="bundlephobia_http"}'
const responseFrontend = '{job="haproxy",proxy="bundlephobia_http"}'

export const numberFormat = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
})
export const compactFormat = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatBytes(value: number) {
  if (value >= 1048576) return `${numberFormat.format(value / 1048576)} MiB`
  if (value >= 1024) return `${numberFormat.format(value / 1024)} KiB`
  return `${numberFormat.format(value)} B`
}

export const STATUS_LABELS: Record<string, string> = {
  '1xx': 'Informational',
  '2xx': 'Success',
  '3xx': 'Redirects',
  '4xx': 'Client errors',
  '5xx': 'Server errors',
  other: 'Other',
}

interface MetricQuery {
  expression: string
  name: string
  label?: string
}

export interface PanelDefinition {
  id: string
  title: string
  description: string
  unit: string
  colors: string[]
  stacked?: boolean
  format: (value: number) => string
  queries: (window: string) => MetricQuery[]
}

// Panel definitions own queries and presentation. Collection and retention
// stay in VictoriaMetrics; pages.ts controls where each panel appears.
export const PANELS: PanelDefinition[] = [
  {
    id: 'requests',
    title: 'Request traffic',
    description: 'Requests reaching the website',
    unit: 'requests / sec',
    colors: ['orange'],
    format: value => numberFormat.format(value),
    queries: window => [
      {
        expression: `sum(rate(haproxy_frontend_http_requests_total${frontend}[${window}]))`,
        name: 'Requests',
      },
    ],
  },
  {
    id: 'responses',
    title: 'Response health',
    description: 'Responses grouped by HTTP status class',
    unit: 'responses / sec',
    colors: ['emerald', 'sky', 'amber', 'rose', 'slate', 'stone'],
    stacked: true,
    format: value => numberFormat.format(value),
    queries: window => [
      {
        expression: `sum by (code) (rate(haproxy_frontend_http_responses_total${responseFrontend}[${window}]))`,
        name: 'Responses',
        label: 'code',
      },
    ],
  },
  {
    id: 'bandwidth',
    title: 'Network traffic',
    description: 'Data sent to and received from visitors',
    unit: 'bytes / sec',
    colors: ['sky', 'slate'],
    format: formatBytes,
    queries: window => [
      {
        expression: `sum(rate(haproxy_frontend_bytes_out_total${frontend}[${window}]))`,
        name: 'Sent',
      },
      {
        expression: `sum(rate(haproxy_frontend_bytes_in_total${frontend}[${window}]))`,
        name: 'Received',
      },
    ],
  },
  {
    id: 'sessions',
    title: 'Open connections',
    description: 'Concurrent sessions at the public frontend',
    unit: 'sessions',
    colors: ['slate'],
    format: value => numberFormat.format(value),
    queries: () => [
      {
        expression: `sum(haproxy_frontend_current_sessions${frontend})`,
        name: 'Sessions',
      },
    ],
  },
]

for (const [id, title, metric, job] of [
  [
    'build-outcomes',
    'Build outcomes',
    'bundlephobia_builds_total',
    'bundlephobia_builds',
  ],
  [
    'install-outcomes',
    'Installation outcomes',
    'bundlephobia_installs_total',
    'bundlephobia_installations',
  ],
]) {
  PANELS.push({
    id,
    title,
    description: 'Completed attempts · success versus failure',
    unit: 'attempts / min',
    colors: ['emerald', 'rose'],
    format: value => numberFormat.format(value),
    queries: window =>
      ['success', 'failure'].map(outcome => ({
        expression: `sum(rate(${metric}{job="${job}",outcome="${outcome}"}[${window}])) * 60`,
        name: outcome === 'success' ? 'Success' : 'Failure',
      })),
  })
}

export interface ChartRow {
  timestamp: number
  time: string
  [key: string]: number | string | null
}

export async function loadPanel(
  panel: PanelDefinition,
  range: TimeRange,
  signal: AbortSignal,
) {
  // Larger views need wider rate windows so every bucket represents its full
  // interval, rather than sampling isolated five-minute fragments of 15 days.
  const window = `${Math.max(300, stepSeconds(range.seconds))}s`
  const end = Math.floor(Date.now() / 60000) * 60
  const queries = panel.queries(window)
  const results = await Promise.all(
    queries.map(query =>
      queryRange(
        { expression: query.expression, seconds: range.seconds, end },
        signal,
      ),
    ),
  )
  const rows = new Map<number, ChartRow>()
  const categories: string[] = []
  const formatter = new Intl.DateTimeFormat(
    undefined,
    range.seconds > 21600
      ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' },
  )
  let hasData = false

  for (const [index, seriesList] of results.entries()) {
    const query = queries[index]
    for (const series of seriesList) {
      const name = query.label
        ? (series.metric[query.label] ?? query.name)
        : query.name
      categories.push(name)
      for (const [timestamp, value] of series.values) {
        const row = rows.get(timestamp) ?? {
          timestamp,
          time: formatter.format(new Date(timestamp * 1000)),
        }
        const numeric = finiteValue(value)
        if (numeric != null) hasData = true
        row[name] = numeric
        rows.set(timestamp, row)
      }
    }
  }

  // Missing history stays missing: never turn scrape gaps into zero traffic.
  const data: ChartRow[] = []
  for (
    let timestamp = end - range.seconds;
    timestamp <= end;
    timestamp += stepSeconds(range.seconds)
  ) {
    const row = rows.get(timestamp) ?? {
      timestamp,
      time: formatter.format(new Date(timestamp * 1000)),
    }
    for (const category of categories) row[category] ??= null
    data.push(row)
  }
  return { data, categories, hasData }
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
  const [builds, installs, buildHealth, installHealth] = await Promise.all([
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
  ])
  const outcome = (rows: typeof builds, value: string) => {
    const row = rows.find(row => row.metric.outcome === value)
    return row ? finiteValue(row.value[1]) : null
  }
  return {
    buildSuccess: outcome(builds, 'success'),
    buildFailure: outcome(builds, 'failure'),
    installSuccess: outcome(installs, 'success'),
    installFailure: outcome(installs, 'failure'),
    health:
      buildHealth[0]?.value[1] === '1' && installHealth[0]?.value[1] === '1'
        ? 1
        : null,
    configured: buildHealth.length > 0 && installHealth.length > 0,
  }
}
