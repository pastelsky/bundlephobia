import { SOURCE_DETAILS, type DashboardSource } from '../sources'
import {
  Badge,
  Button,
  Callout,
  Switch,
  Tab,
  TabGroup,
  TabList,
} from '@tremor/react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Activity, RefreshCw, ShieldAlert } from 'lucide-react'
import { TIME_RANGES, type TimeRange } from '../../lib/api'
import type { PageSummary } from '../metrics'
import type { DashboardPage } from '../pages'

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
    <div className="flex items-center justify-between gap-3 mobile:flex-col mobile:items-start">
      <div>
        <div className="mb-2.5 text-[9px] font-semibold tracking-[1.7px] text-stats-muted">
          {SOURCE_DETAILS[page.source].eyebrow}
        </div>
        <h1 className="text-[25px] font-semibold leading-tight tracking-[-1.2px] text-stats-text mobile:text-[27px]">
          {page.heading}
        </h1>
        <p className="mt-2.5 text-[13px] text-stats-muted mobile:text-[11px]">
          {page.description}
        </p>
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
    <div className="mb-[22px] mt-7 flex items-center justify-between gap-3 mobile:mb-[18px] mobile:mt-[22px] mobile:flex-wrap">
      <TabGroup
        className="w-auto shrink-0 mobile:w-full"
        index={TIME_RANGES.findIndex(
          option => option.label === props.range.label,
        )}
        onIndexChange={index => props.onRangeChange(TIME_RANGES[index])}
      >
        <TabList variant="solid" aria-label="Time range">
          {TIME_RANGES.map(option => (
            <Tab className="mobile:flex-1" key={option.label}>
              {option.label}
            </Tab>
          ))}
        </TabList>
      </TabGroup>
      <div className="flex items-center gap-3 mobile:w-full mobile:justify-between mobile:gap-2">
        <div className="flex items-center gap-[7px] whitespace-nowrap text-[11px] text-stats-muted">
          <Switch
            id="auto-refresh"
            checked={props.live}
            onChange={props.onLiveChange}
            color="orange"
          />
          <label htmlFor="auto-refresh">Auto-refresh</label>
        </div>
        <span className="whitespace-nowrap text-[10px] text-stats-muted narrow:hidden">
          Updated {updated}
        </span>
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
      className="mt-[18px]"
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
      className="mt-3.5"
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
      className="mb-[18px]"
      title="Metrics unavailable"
      icon={ShieldAlert}
      color="amber"
      role="alert"
    >
      {query.error.message}
    </Callout>
  )
}
