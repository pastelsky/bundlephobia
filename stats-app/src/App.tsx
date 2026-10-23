import { useState } from 'react'
import {
  Navigate,
  NavLink,
  useLocation,
  useSearchParams,
} from 'react-router-dom'
import { PAGES } from './pages'
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query'
import { AreaChart, Card, Metric, Text } from '@tremor/react'
import {
  Activity,
  ArrowDownLeft,
  Cable,
  ChevronRight,
  ExternalLink,
  Radio,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { TIME_RANGES, type TimeRange } from './api'
import {
  compactFormat,
  loadPanel,
  loadSummary,
  loadPipelineSummary,
  loadResourceSummary,
  formatBytes,
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
            <span>No history yet, or the service is not being scraped.</span>
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
      <nav aria-label="Dashboard pages">
        {PAGES.map(page => (
          <NavLink
            key={page.id}
            to={`/${page.id}`}
            className={({ isActive }) => (isActive ? 'nav-primary' : undefined)}
          >
            <page.icon size={17} />
            {page.title}
          </NavLink>
        ))}
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

function PipelineCards({
  data,
  loading,
}: {
  data?: Awaited<ReturnType<typeof loadPipelineSummary>>
  loading: boolean
}) {
  const cards = [
    { title: 'Successful builds', value: data?.buildSuccess, kind: 'success' },
    { title: 'Failed builds', value: data?.buildFailure, kind: 'failure' },
    {
      title: 'Successful installs',
      value: data?.installSuccess,
      kind: 'success',
    },
    { title: 'Failed installs', value: data?.installFailure, kind: 'failure' },
  ]
  return <ValueCards cards={cards} loading={loading} />
}

interface ValueCard {
  title: string
  value?: number | null
  kind?: string
  format?: (value: number) => string
  detail?: string
}

function ValueCards({
  cards,
  loading,
}: {
  cards: ValueCard[]
  loading: boolean
}) {
  return (
    <div className="summary-grid">
      {cards.map(card => (
        <Card
          key={card.title}
          className={`summary-card outcome-${card.kind ?? 'neutral'}`}
        >
          <Text>{card.title}</Text>
          <Metric
            className={loading ? 'metric-loading shimmer' : 'metric-value'}
          >
            {card.value == null
              ? '—'
              : (card.format ?? (value => compactFormat.format(value)))(
                  card.value,
                )}
          </Metric>
          <p className="stat-detail">
            {card.detail ?? 'In the selected time range'}
          </p>
        </Card>
      ))}
    </div>
  )
}

type ResourceData = Awaited<ReturnType<typeof loadResourceSummary>>
const diskLabels: Record<string, string> = {
  root: 'Main filesystem',
  builds: 'Temporary builds',
  metrics: 'VictoriaMetrics',
}

function ResourceCards({
  data,
  loading,
}: {
  data?: ResourceData
  loading: boolean
}) {
  const root = data?.disks.find(disk => disk.mount === 'root')
  const cards = [
    {
      title: 'CPU usage',
      value: data?.cpu,
      format: (value: number) => `${numberFormat.format(value)}%`,
      detail: 'Average over the last 5 minutes',
    },
    {
      title: 'CPU load',
      value: data?.load,
      detail: `1-minute load · ${data?.cores ?? '—'} CPU cores`,
    },
    {
      title: 'Memory used',
      value: data?.memoryUsed,
      format: formatBytes,
      detail: `${data?.memoryTotal == null ? '—' : formatBytes(data.memoryTotal)} total RAM · cache excluded`,
    },
    {
      title: 'Main disk available',
      value: root?.available,
      format: formatBytes,
      detail: `${root?.total == null ? '—' : formatBytes(root.total)} total capacity`,
    },
  ]
  return <ValueCards cards={cards} loading={loading} />
}

function DiskBreakdown({ data }: { data?: ResourceData }) {
  return (
    <Card className="breakdown-card">
      <div className="panel-heading">
        <div>
          <h2>Filesystem capacity</h2>
          <p>
            Separate mounts for the website, temporary builds, and metrics
            storage
          </p>
        </div>
      </div>
      <table
        className="response-table capacity-table"
        aria-label="Filesystem capacity"
      >
        <thead>
          <tr className="response-row table-heading">
            <th scope="col">Filesystem</th>
            <th scope="col">Used</th>
            <th scope="col">Available</th>
            <th scope="col">Capacity</th>
          </tr>
        </thead>
        <tbody>
          {data?.disks.map(disk => (
            <tr key={disk.mount} className="response-row">
              <td className="response-label">
                <strong>{diskLabels[disk.mount]}</strong>
              </td>
              {[disk.used, disk.available, disk.total].map((value, index) => (
                <td key={index} className="numeric">
                  {value == null ? '—' : formatBytes(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

export function App() {
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const page =
    PAGES.find(page => location.pathname === `/${page.id}`) ?? PAGES[0]
  const tab =
    page.tabs.find(tab => tab.id === params.get('tab')) ?? page.tabs[0]
  const panelIds = tab?.panels ?? page.panels
  const pipeline = page.source === 'pipeline'
  const resources = page.source === 'resources'
  const [range, setRange] = useState(TIME_RANGES[0])
  const [live, setLive] = useState(true)
  const client = useQueryClient()
  const refreshing = useIsFetching() > 0
  const summary = useQuery({
    queryKey: ['summary', range.label],
    queryFn: ({ signal }) => loadSummary(range, signal),
    refetchInterval: live ? 60000 : false,
    enabled: !pipeline && !resources,
  })
  const pipelineSummary = useQuery({
    queryKey: ['pipeline-summary', range.label],
    queryFn: ({ signal }) => loadPipelineSummary(range, signal),
    refetchInterval: live ? 60000 : false,
    enabled: pipeline,
  })
  const resourceSummary = useQuery({
    queryKey: ['resource-summary'],
    queryFn: ({ signal }) => loadResourceSummary(signal),
    refetchInterval: live ? 60000 : false,
    enabled: resources,
  })
  const activeSummary = resources
    ? resourceSummary
    : pipeline
      ? pipelineSummary
      : summary
  const healthy = activeSummary.data?.health === 1 && !activeSummary.isError
  const summaryData = summary.isError ? undefined : summary.data
  const updated = activeSummary.dataUpdatedAt
    ? new Date(activeSummary.dataUpdatedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

  if (location.pathname === '/') return <Navigate to="/overview" replace />

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content" id="overview">
        <header className="topbar">
          <span>
            Infrastructure
            <ChevronRight size={13} />
            <strong>{page.heading}</strong>
          </span>
          <span className="topbar-environment">
            <span className="environment-dot" />
            Production
          </span>
        </header>
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {resources
                  ? 'HOST MONITORING'
                  : pipeline
                    ? 'APPLICATION SERVICES'
                    : 'WEBSITE ANALYTICS'}
              </div>
              <h1>{page.heading}</h1>
              <p>{page.description}</p>
            </div>
            <span className={`health-badge ${healthy ? 'healthy' : ''}`}>
              <span />
              {activeSummary.isPending
                ? 'Connecting'
                : healthy
                  ? resources
                    ? 'Host metrics collecting'
                    : pipeline
                      ? 'Services collecting'
                      : 'HAProxy scrape healthy'
                  : (resources && resourceSummary.data?.configured === false) ||
                      (pipeline && pipelineSummary.data?.configured === false)
                    ? 'Collection not enabled'
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
          {activeSummary.isError && (
            <div className="error-banner" role="alert">
              <ShieldAlert size={17} />
              <span>{activeSummary.error?.message}</span>
            </div>
          )}
          {resources ? (
            <ResourceCards
              data={resourceSummary.isError ? undefined : resourceSummary.data}
              loading={resourceSummary.isPending}
            />
          ) : pipeline ? (
            <PipelineCards
              data={pipelineSummary.isError ? undefined : pipelineSummary.data}
              loading={pipelineSummary.isPending}
            />
          ) : (
            <SummaryCards data={summaryData} loading={summary.isPending} />
          )}
          {page.tabs.length > 0 && (
            <fieldset className="page-tabs" aria-label="Activity view">
              {page.tabs.map(option => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={tab?.id === option.id}
                  onClick={() => setParams({ tab: option.id })}
                >
                  {option.title}
                </button>
              ))}
            </fieldset>
          )}
          {pipeline && (
            <div className="collection-note">
              <Activity size={16} />
              <span>
                {pipelineSummary.data?.configured
                  ? 'Counting completed attempts. '
                  : 'Application metrics need to be deployed before these panels collect data. '}
                Installs exclude cached reuse. Builds include size and export
                analysis; an install error can also fail a build. History starts
                when collection is enabled. Process kills cannot report an
                outcome.
              </span>
            </div>
          )}
          <div className="section-label">
            <span>
              {resources
                ? 'HOST RESOURCE USAGE'
                : pipeline
                  ? 'APPLICATION OUTCOMES'
                  : 'TRAFFIC & RELIABILITY'}
            </span>
            <span>
              {resources
                ? 'Whole server · sampled once per minute'
                : pipeline
                  ? 'Success and failure · per completed attempt'
                  : 'Website frontend · background health checks excluded'}
            </span>
          </div>
          <div className="charts-grid">
            {PANELS.filter(panel => panelIds.includes(panel.id)).map(panel => (
              <ChartPanel
                key={panel.id}
                panel={panel}
                range={range}
                live={live}
              />
            ))}
          </div>
          {page.breakdown && <ResponseBreakdown data={summaryData} />}
          {resources && (
            <DiskBreakdown
              data={resourceSummary.isError ? undefined : resourceSummary.data}
            />
          )}
          <footer>
            <span>
              <span className="footer-dot" />
              {resources
                ? 'Host resource counters'
                : pipeline
                  ? 'Application counters'
                  : 'HAProxy metrics'}{' '}
              · stored in VictoriaMetrics
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
