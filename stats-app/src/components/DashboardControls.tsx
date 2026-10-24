import type { UseQueryResult } from '@tanstack/react-query'
import { Activity, ChevronRight, RefreshCw, ShieldAlert } from 'lucide-react'
import { TIME_RANGES, type TimeRange } from '../api'
import type { PageSummary } from '../metrics'
import type { DashboardPage, DashboardSource } from '../pages'

export const SOURCE_DETAILS = {
  haproxy: {
    eyebrow: 'WEBSITE ANALYTICS',
    healthy: 'HAProxy scrape healthy',
    section: 'TRAFFIC & RELIABILITY',
    scope: 'Website frontend · background health checks excluded',
    footer: 'HAProxy metrics',
  },
  pipeline: {
    eyebrow: 'APPLICATION SERVICES',
    healthy: 'Services collecting',
    section: 'APPLICATION OUTCOMES',
    scope: 'Success and failure · per completed attempt',
    footer: 'Application counters',
  },
  resources: {
    eyebrow: 'HOST MONITORING',
    healthy: 'Host metrics collecting',
    section: 'HOST RESOURCE USAGE',
    scope: 'Whole server · sampled once per minute',
    footer: 'Host resource counters',
  },
}

export type SummaryQuery = UseQueryResult<PageSummary, Error>

function healthLabel(query: SummaryQuery) {
  if (query.isPending) return 'Connecting'

  if (query.isError || !query.data) return 'Scrape unavailable'
  const { source, data } = query.data

  if (data.health === 1) return SOURCE_DETAILS[source].healthy

  if ('configured' in data && !data.configured) return 'Collection not enabled'

  return 'Scrape unavailable'
}

export function PageHeader({
  page,
  query,
}: {
  page: DashboardPage
  query: SummaryQuery
}) {
  const healthy = !query.isError && query.data?.data.health === 1

  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{SOURCE_DETAILS[page.source].eyebrow}</div>
        <h1>{page.heading}</h1>
        <p>{page.description}</p>
      </div>
      <span className={`health-badge ${healthy ? 'healthy' : ''}`}>
        <span />
        {healthLabel(query)}
      </span>
    </div>
  )
}

export function Topbar({ title }: { title: string }) {
  return (
    <header className="topbar">
      <span>
        Infrastructure
        <ChevronRight size={13} />
        <strong>{title}</strong>
      </span>
      <span className="topbar-environment">
        <span className="environment-dot" />
        Production
      </span>
    </header>
  )
}

interface ToolbarProps {
  range: TimeRange
  live: boolean
  refreshing: boolean
  updatedAt: number
  onRangeChange(range: TimeRange): void
  onLiveChange(live: boolean): void
  onRefresh(): void
}

export function DashboardToolbar(props: ToolbarProps) {
  const updated = props.updatedAt
    ? new Date(props.updatedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

  return (
    <div className="toolbar">
      <fieldset className="range-selector" aria-label="Time range">
        {TIME_RANGES.map(option => (
          <button
            type="button"
            key={option.label}
            aria-pressed={props.range.label === option.label}
            onClick={() => props.onRangeChange(option)}
          >
            {option.label}
          </button>
        ))}
      </fieldset>
      <div className="refresh-controls">
        <label className="live-toggle">
          <input
            type="checkbox"
            checked={props.live}
            onChange={event => props.onLiveChange(event.target.checked)}
          />
          <span />
          Auto-refresh
        </label>
        <span className="updated-label">Updated {updated}</span>
        <button
          className="refresh-button"
          type="button"
          onClick={props.onRefresh}
          aria-label="Refresh all metrics"
          disabled={props.refreshing}
          aria-busy={props.refreshing}
        >
          <RefreshCw size={15} className={props.refreshing ? 'spinning' : ''} />
          Refresh
        </button>
      </div>
    </div>
  )
}

interface TabsProps {
  page: DashboardPage
  activeTab?: string
  onChange(tab: string): void
}

export function PageTabs({ page, activeTab, onChange }: TabsProps) {
  if (page.tabs.length === 0) return null

  return (
    <fieldset className="page-tabs" aria-label="Activity view">
      {page.tabs.map(option => (
        <button
          key={option.id}
          type="button"
          aria-pressed={activeTab === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.title}
        </button>
      ))}
    </fieldset>
  )
}

export function CollectionNote({
  source,
  summary,
}: {
  source: DashboardSource
  summary?: PageSummary
}) {
  if (source !== 'pipeline') return null
  const configured = summary?.source === 'pipeline' && summary.data.configured

  return (
    <div className="collection-note">
      <Activity size={16} />
      <span>
        {configured
          ? 'Counting completed attempts. '
          : 'Application metrics need to be deployed before these panels collect data. '}
        Installs exclude cached reuse. Builds include size and export analysis;
        an install error can also fail a build. History starts when collection
        is enabled. Process kills cannot report an outcome.
      </span>
    </div>
  )
}

export function SummaryError({ query }: { query: SummaryQuery }) {
  if (!query.isError) return null

  return (
    <div className="error-banner" role="alert">
      <ShieldAlert size={17} />
      <span>{query.error.message}</span>
    </div>
  )
}
