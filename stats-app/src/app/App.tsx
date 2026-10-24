import { SOURCE_DETAILS, type DashboardSource } from '../dashboard/sources'
import { Topbar } from '../dashboard/components/Topbar'
import { useState } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query'
import { resolvePage } from '../dashboard/pages'
import { TIME_RANGES } from '../lib/api'
import { loadPageSummary, type PageSummary } from '../dashboard/metrics'
import { Sidebar } from '../dashboard/components/Sidebar'
import { ChartPanel } from '../dashboard/components/ChartPanel'
import {
  SummaryCards,
  PipelineCards,
  ResourceCards,
} from '../dashboard/components/SummaryCards'
import {
  ResponseBreakdown,
  DiskBreakdown,
} from '../dashboard/components/Breakdowns'
import {
  PageHeader,
  DashboardToolbar,
  PageTabs,
  CollectionNote,
  SummaryError,
} from '../dashboard/components/DashboardControls'

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
    <div className="[--sidebar-width:204px] narrow:[--sidebar-width:194px] compact:[--sidebar-width:64px] mobile:[--sidebar-width:0px]">
      <Sidebar />
      <main className="ml-[var(--sidebar-width)] min-h-screen" id="overview">
        <Topbar title={page.heading} />
        <div className="mx-auto max-w-[1600px] px-6 pb-4 pt-[22px] wide:pt-11 narrow:py-[26px] mobile:px-[18px]">
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
          <div className="mb-3.5 mt-[31px] flex justify-between gap-3 text-[9px] text-slate-400 mobile:mt-6">
            <span className="font-semibold tracking-[1.2px] text-slate-500">
              {details.section}
            </span>
            <span className="compact:hidden">{details.scope}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mobile:grid-cols-1 mobile:gap-3.5">
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
          <footer className="flex items-center justify-between gap-5 pb-1 pt-6 text-[9px] text-slate-400 mobile:flex-col mobile:items-start mobile:gap-2.5 mobile:text-[8px]">
            <span className="flex items-center gap-1.5">
              <span className="size-[5px] rounded-full bg-slate-300" />
              {details.footer} · stored in VictoriaMetrics
            </span>
            <span className="flex items-center gap-1.5">
              Gaps indicate unavailable history ·{' '}
              {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </span>
          </footer>
        </div>
      </main>
    </div>
  )
}
