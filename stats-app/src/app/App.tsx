import { SOURCE_DETAILS, type DashboardSource } from '../dashboard/sources'
import { Topbar } from '../components/layout/Topbar'
import styles from './App.module.css'
import { useState } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query'
import { resolvePage } from '../dashboard/pages'
import { TIME_RANGES } from '../lib/api'
import { loadPageSummary, type PageSummary } from '../dashboard/metrics'
import { Sidebar } from '../components/layout/Sidebar'
import { ChartPanel } from '../components/charts/ChartPanel'
import {
  SummaryCards,
  PipelineCards,
  ResourceCards,
} from '../components/summaries/SummaryCards'
import {
  ResponseBreakdown,
  DiskBreakdown,
} from '../components/breakdowns/Breakdowns'
import {
  PageHeader,
  DashboardToolbar,
  PageTabs,
  CollectionNote,
  SummaryError,
} from '../components/controls/DashboardControls'

interface SummarySectionProps {
  source: DashboardSource
  summary?: PageSummary
  loading: boolean
}

const SUMMARY_CARDS = {
  haproxy: SummaryCards,
  pipeline: PipelineCards,
  resources: ResourceCards,
}

function SummarySection({ source, summary, loading }: SummarySectionProps) {
  const Placeholder = SUMMARY_CARDS[source]

  if (!summary) return <Placeholder loading={loading} />

  switch (summary.source) {
    case 'pipeline':
      return <PipelineCards data={summary.data} loading={loading} />
    case 'resources':
      return <ResourceCards data={summary.data} loading={loading} />
    case 'haproxy':
      return <SummaryCards data={summary.data} loading={loading} />
  }
}

function PageBreakdown({
  summary,
  showResponses,
}: {
  summary?: PageSummary
  showResponses: boolean
}) {
  if (summary?.source === 'resources')
    return <DiskBreakdown data={summary.data} />

  if (showResponses)
    return (
      <ResponseBreakdown
        data={summary?.source === 'haproxy' ? summary.data : undefined}
      />
    )

  return null
}

export function App() {
  const location = useLocation()
  const [params, setParams] = useSearchParams()

  const { page, tabId, panels } = resolvePage(
    location.pathname,
    params.get('tab'),
  )

  const [range, setRange] = useState(TIME_RANGES[0])
  const [live, setLive] = useState(true)
  const client = useQueryClient()
  const refreshing = useIsFetching() > 0

  const query = useQuery({
    queryKey: ['summary', page.source, range.label],
    queryFn: ({ signal }) => loadPageSummary(page.source, range, signal),
    refetchInterval: live ? 60000 : false,
  })

  const summary = query.isError ? undefined : query.data
  const details = SOURCE_DETAILS[page.source]

  if (location.pathname === '/') return <Navigate to="/overview" replace />

  return (
    <div className={styles.appShell}>
      <Sidebar />
      <main className={styles.mainContent} id="overview">
        <Topbar title={page.heading} />
        <div className={styles.dashboardContent}>
          <PageHeader page={page} query={query} />
          <DashboardToolbar
            range={range}
            live={live}
            refreshing={refreshing}
            updatedAt={query.dataUpdatedAt}
            onRangeChange={setRange}
            onLiveChange={setLive}
            onRefresh={() => void client.invalidateQueries()}
          />
          <SummaryError query={query} />
          <SummarySection
            source={page.source}
            summary={summary}
            loading={query.isPending}
          />
          <PageTabs
            page={page}
            activeTab={tabId}
            onChange={tab => setParams({ tab })}
          />
          <CollectionNote source={page.source} summary={summary} />
          <div className={styles.sectionLabel}>
            <span>{details.section}</span>
            <span>{details.scope}</span>
          </div>
          <div className={styles.chartsGrid}>
            {panels.map(panel => (
              <ChartPanel
                key={panel.id}
                panel={panel}
                range={range}
                live={live}
              />
            ))}
          </div>
          <PageBreakdown summary={summary} showResponses={page.breakdown} />
          <footer className={styles.footer}>
            <span>
              <span className={styles.footerDot} />
              {details.footer} · stored in VictoriaMetrics
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
