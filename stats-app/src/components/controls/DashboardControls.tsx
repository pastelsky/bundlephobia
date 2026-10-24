import { SOURCE_DETAILS, type DashboardSource } from '../../dashboard/sources'
import {
  Badge,
  Button,
  Callout,
  Switch,
  Tab,
  TabGroup,
  TabList,
} from '@tremor/react'
import styles from './DashboardControls.module.css'
import type { UseQueryResult } from '@tanstack/react-query'
import { Activity, RefreshCw, ShieldAlert } from 'lucide-react'
import { TIME_RANGES, type TimeRange } from '../../lib/api'
import type { PageSummary } from '../../dashboard/metrics'
import type { DashboardPage } from '../../dashboard/pages'

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
    <div className={styles.pageHeading}>
      <div>
        <div className={styles.eyebrow}>
          {SOURCE_DETAILS[page.source].eyebrow}
        </div>
        <h1>{page.heading}</h1>
        <p>{page.description}</p>
      </div>
      <Badge color={healthy ? 'emerald' : 'amber'} size="xs">
        {healthLabel(query)}
      </Badge>
    </div>
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
    <div className={styles.toolbar}>
      <TabGroup
        className={styles.rangeSelector}
        index={TIME_RANGES.findIndex(
          option => option.label === props.range.label,
        )}
        onIndexChange={index => props.onRangeChange(TIME_RANGES[index])}
      >
        <TabList variant="solid" aria-label="Time range">
          {TIME_RANGES.map(option => (
            <Tab key={option.label}>{option.label}</Tab>
          ))}
        </TabList>
      </TabGroup>
      <div className={styles.refreshControls}>
        <div className={styles.liveToggle}>
          <Switch
            id="auto-refresh"
            checked={props.live}
            onChange={props.onLiveChange}
            color="orange"
          />
          <label htmlFor="auto-refresh">Auto-refresh</label>
        </div>
        <span className={styles.updatedLabel}>Updated {updated}</span>
        <Button
          size="xs"
          variant="secondary"
          color="slate"
          icon={RefreshCw}
          onClick={props.onRefresh}
          aria-label="Refresh all metrics"
          loading={props.refreshing}
          loadingText="Refreshing"
        >
          Refresh
        </Button>
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
    <TabGroup
      className={styles.pageTabs}
      index={Math.max(
        0,
        page.tabs.findIndex(tab => tab.id === activeTab),
      )}
      onIndexChange={index => onChange(page.tabs[index].id)}
    >
      <TabList color="orange" aria-label="Activity view">
        {page.tabs.map(option => (
          <Tab key={option.id}>{option.title}</Tab>
        ))}
      </TabList>
    </TabGroup>
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
    <Callout
      className={styles.collectionNote}
      icon={Activity}
      color="slate"
      title="About these counters"
    >
      {configured
        ? 'Counting completed attempts. '
        : 'Application metrics need to be deployed before these panels collect data. '}
      Installs exclude cached reuse. Builds include size and export analysis; an
      install error can also fail a build. History starts when collection is
      enabled. Process kills cannot report an outcome.
    </Callout>
  )
}

export function SummaryError({ query }: { query: SummaryQuery }) {
  if (!query.isError) return null

  return (
    <Callout
      className={styles.errorBanner}
      title="Metrics unavailable"
      icon={ShieldAlert}
      color="amber"
      role="alert"
    >
      {query.error.message}
    </Callout>
  )
}
