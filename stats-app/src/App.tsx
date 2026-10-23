import { useState } from 'react'
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query'
import { AreaChart, Card, Metric, Text } from '@tremor/react'
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Cable,
  ChevronRight,
  ExternalLink,
  LayoutDashboard,
  Radio,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { TIME_RANGES, type TimeRange } from './api'
import {
  compactFormat,
  loadPanel,
  loadSummary,
  numberFormat,
  PANELS,
  STATUS_LABELS,
  type PanelDefinition,
} from './metrics'

const statusColors: Record<string, string> = {
  '1xx': 'slate',
  '2xx': 'emerald',
  '3xx': 'sky',
  '4xx': 'amber',
  '5xx': 'rose',
  other: 'stone',
}
const statusOrder = ['2xx', '3xx', '4xx', '5xx', '1xx', 'other']

interface PanelProps {
  panel: PanelDefinition
  range: TimeRange
  live: boolean
}

function ChartPanel({ panel, range, live }: PanelProps) {
  const query = useQuery({
    queryKey: ['panel', panel.id, range.label],
    queryFn: ({ signal }) => loadPanel(panel, range, signal),
    refetchInterval: live ? 60000 : false,
  })
  const categories = query.data?.categories ?? []
  const ordered =
    panel.id === 'responses'
      ? statusOrder.filter(
          code =>
            categories.includes(code) &&
            (!['1xx', 'other'].includes(code) ||
              query.data?.data.some(row => Number(row[code] ?? 0) > 0)),
        )
      : categories
  const colors =
    panel.id === 'responses'
      ? ordered.map(code => statusColors[code])
      : panel.colors

  return (
    <Card className="chart-card" id={panel.id}>
      <div className="panel-heading">
        <div>
          <h2>{panel.title}</h2>
          <p>{panel.description}</p>
        </div>
        <span className="unit-label">{panel.unit}</span>
      </div>
      {query.isPending && (
        <div
          className="chart-placeholder shimmer"
          aria-label={`Loading ${panel.title}`}
        />
      )}
      {query.isError && (
        <div className="chart-placeholder panel-message" role="alert">
          <ShieldAlert size={20} />
          <p>{query.error.message}</p>
          <button type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      )}
      {query.data &&
        !query.isError &&
        (query.data.hasData ? (
          <AreaChart
            className="traffic-chart"
            data={query.data.data}
            index="time"
            categories={ordered}
            colors={colors}
            valueFormatter={panel.format}
            stack={panel.stacked}
            showGradient={!panel.stacked}
            connectNulls={false}
            curveType="linear"
            showAnimation={false}
            showLegend={ordered.length > 1}
            startEndOnly
            yAxisWidth={60}
            noDataText="No samples in this time range"
          />
        ) : (
          <div className="chart-placeholder panel-message">
            <Activity size={20} />
            <p>No samples in this time range.</p>
            <span>Try a shorter range or check the HAProxy scrape.</span>
          </div>
        ))}
    </Card>
  )
}

type SummaryData = Awaited<ReturnType<typeof loadSummary>>

function SummaryCards({
  data,
  loading,
}: {
  data?: SummaryData
  loading: boolean
}) {
  const totalResponses =
    data?.responses.reduce((sum, row) => sum + (row.count ?? 0), 0) ?? 0
  const errors = data?.responses.find(row => row.code === '5xx')?.count ?? 0
  const errorShare = totalResponses > 0 ? (errors / totalResponses) * 100 : null
  const cards = [
    {
      title: 'Total requests',
      value: data?.requests,
      format: (value: number) => compactFormat.format(value),
      detail: 'In the selected time range',
      icon: ArrowDownLeft,
      kind: 'orange',
    },
    {
      title: 'Request rate',
      value: data?.rate,
      format: (value: number) => `${numberFormat.format(value)}/s`,
      detail: 'Average over the last 5 minutes',
      icon: Activity,
      kind: 'blue',
    },
    {
      title: 'Server error share',
      value: errorShare,
      format: (value: number) => `${numberFormat.format(value)}%`,
      detail: '5xx share of responses in this range',
      icon: ShieldAlert,
      kind: 'rose',
    },
    {
      title: 'Open connections',
      value: data?.sessions,
      format: (value: number) => numberFormat.format(value),
      detail: 'Current sessions at the frontend',
      icon: Cable,
      kind: 'violet',
    },
  ]

  return (
    <div className="summary-grid">
      {cards.map(card => (
        <Card key={card.title} className="summary-card">
          <div className="summary-heading">
            <Text>{card.title}</Text>
            <span className={`stat-icon ${card.kind}`}>
              <card.icon size={17} strokeWidth={1.7} />
            </span>
          </div>
          <Metric
            className={loading ? 'metric-loading shimmer' : 'metric-value'}
          >
            {card.value == null ? '—' : card.format(card.value)}
          </Metric>
          <p className="stat-detail">{card.detail}</p>
        </Card>
      ))}
    </div>
  )
}

function ResponseBreakdown({ data }: { data?: SummaryData }) {
  const total =
    data?.responses.reduce((sum, row) => sum + (row.count ?? 0), 0) ?? 0
  const rows =
    data?.responses
      .filter(row => row.count != null && row.count > 0)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)) ?? []
  return (
    <Card className="breakdown-card">
      <div className="panel-heading">
        <div>
          <h2>Response breakdown</h2>
          <p>Count and share in the selected time range</p>
        </div>
        <span className="unit-label">
          {compactFormat.format(total)} responses
        </span>
      </div>
      <table className="response-table" aria-label="Responses by status class">
        <thead>
          <tr className="response-row table-heading">
            <th scope="col">Status class</th>
            <th scope="col">Distribution</th>
            <th scope="col">Responses</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr className="response-row" key={row.code}>
              <td className="response-label">
                <span className={`status-dot status-${row.code}`} />
                <strong>{row.code}</strong>
                <span>{STATUS_LABELS[row.code] ?? 'Other'}</span>
              </td>
              <td aria-label={`Distribution for ${row.code}`}>
                <span className="distribution">
                  <span
                    className={`distribution-fill status-${row.code}`}
                    style={{ width: `${((row.count ?? 0) / total) * 100}%` }}
                  />
                </span>
              </td>
              <td className="numeric">
                {numberFormat.format(Math.round(row.count ?? 0))}
              </td>
              <td className="numeric">
                {numberFormat.format(((row.count ?? 0) / total) * 100)}%
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="empty-table">
                No response counts available yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  )
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <a href="/" className="brand">
        <span className="brand-symbol">
          b<span>.</span>
        </span>
        <span>
          bundlephobia<small>OBSERVABILITY</small>
        </span>
      </a>
      <div className="workspace-label">
        <span className="workspace-avatar">B</span>
        <span>
          Bundlephobia
          <small>
            <span className="environment-dot" />
            Production
          </small>
        </span>
      </div>
      <span className="nav-label">MONITORING</span>
      <nav aria-label="Dashboard sections">
        <a className="nav-primary" href="#overview">
          <LayoutDashboard size={17} />
          Overview
          <span className="nav-live" />
        </a>
        <a href="#requests">
          <Activity size={17} />
          Request traffic
        </a>
        <a href="#responses">
          <ShieldAlert size={17} />
          Response health
        </a>
        <a href="#bandwidth">
          <ArrowUpRight size={17} />
          Network traffic
        </a>
        <a href="#sessions">
          <Cable size={17} />
          Connections
        </a>
      </nav>
      <div className="sidebar-bottom">
        <a href="/stats/vmui/">
          <ExternalLink size={15} />
          Open query explorer
        </a>
        <div className="storage-note">
          <Radio size={16} />
          <span>
            Powered by VictoriaMetrics
            <small>60-second scrape · 15-day retention</small>
          </span>
        </div>
      </div>
    </aside>
  )
}

export function App() {
  const [range, setRange] = useState(TIME_RANGES[0])
  const [live, setLive] = useState(true)
  const client = useQueryClient()
  const refreshing = useIsFetching() > 0
  const summary = useQuery({
    queryKey: ['summary', range.label],
    queryFn: ({ signal }) => loadSummary(range, signal),
    refetchInterval: live ? 60000 : false,
  })
  const healthy = summary.data?.health === 1 && !summary.isError
  const summaryData = summary.isError ? undefined : summary.data
  const updated = summary.dataUpdatedAt
    ? new Date(summary.dataUpdatedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content" id="overview">
        <header className="topbar">
          <span>
            Infrastructure
            <ChevronRight size={13} />
            <strong>Traffic overview</strong>
          </span>
          <span className="topbar-environment">
            <span className="environment-dot" />
            Production
          </span>
        </header>
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">WEBSITE ANALYTICS</div>
              <h1>Traffic overview</h1>
              <p>A live view of requests, response health, and connections.</p>
            </div>
            <span className={`health-badge ${healthy ? 'healthy' : ''}`}>
              <span />
              {summary.isPending
                ? 'Connecting'
                : healthy
                  ? 'HAProxy scrape healthy'
                  : 'Scrape unavailable'}
            </span>
          </div>
          <div className="toolbar">
            <fieldset className="range-selector" aria-label="Time range">
              {TIME_RANGES.map(option => (
                <button
                  type="button"
                  key={option.label}
                  aria-pressed={range.label === option.label}
                  onClick={() => setRange(option)}
                >
                  {option.label}
                </button>
              ))}
            </fieldset>
            <div className="refresh-controls">
              <label className="live-toggle">
                <input
                  type="checkbox"
                  checked={live}
                  onChange={event => setLive(event.target.checked)}
                />
                <span />
                Auto-refresh
              </label>
              <span className="updated-label">Updated {updated}</span>
              <button
                className="refresh-button"
                type="button"
                onClick={() => void client.invalidateQueries()}
                aria-label="Refresh all metrics"
                disabled={refreshing}
                aria-busy={refreshing}
              >
                <RefreshCw size={15} className={refreshing ? 'spinning' : ''} />
                Refresh
              </button>
            </div>
          </div>
          {summary.isError && (
            <div className="error-banner" role="alert">
              <ShieldAlert size={17} />
              <span>{summary.error.message}</span>
            </div>
          )}
          <SummaryCards data={summaryData} loading={summary.isPending} />
          <div className="section-label">
            <span>TRAFFIC & RELIABILITY</span>
            <span>Website frontend · background health checks excluded</span>
          </div>
          <div className="charts-grid">
            {PANELS.map(panel => (
              <ChartPanel
                key={panel.id}
                panel={panel}
                range={range}
                live={live}
              />
            ))}
          </div>
          <ResponseBreakdown data={summaryData} />
          <footer>
            <span>
              <span className="footer-dot" />
              Existing HAProxy metrics · stored in VictoriaMetrics
            </span>
            <span>
              Gaps indicate unavailable history ·{' '}
              {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </span>
          </footer>
        </div>
      </main>
    </div>
  )
}
