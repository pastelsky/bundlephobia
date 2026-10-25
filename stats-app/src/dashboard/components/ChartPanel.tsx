import { useMemo, useState } from 'react'
import { Panel, PanelHeader } from '../../components/ui/Panel'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { Button, Tab, TabGroup, TabList } from '@tremor/react'
import { TimeSeriesChart } from '../../components/ui/TimeSeriesChart'
import { CapacityReadout } from '../../components/ui/CapacityReadout'
import { LoadingPlaceholder } from '../../components/ui/LoadingPlaceholder'
import { Activity, ShieldAlert } from 'lucide-react'
import { loadPanel, type ChartRow } from '../metrics'
import type { ChartCapacity, ChartDefinition } from '../charts'
import { chartResolution, type ChartRange } from '../../lib/api'

type PanelData = Awaited<ReturnType<typeof loadPanel>>

interface PanelProps {
  panel: ChartDefinition
  range: ChartRange
  live: boolean
}

interface ContentProps {
  panel: ChartDefinition
  query: UseQueryResult<PanelData, Error>
}

function ChartContent({ panel, query }: ContentProps) {
  if (query.isPending)
    return (
      <LoadingPlaceholder
        className="mt-6 h-[205px] wide:h-[280px]"
        label={`Loading ${panel.title}`}
      />
    )

  if (query.isError)
    return (
      <div
        className="mt-6 flex h-[205px] flex-col items-center justify-center gap-3 rounded p-5 text-center text-xs text-stats-muted wide:h-[280px]"
        role="alert"
      >
        <ShieldAlert size={20} />
        <p>{query.error.message}</p>
        <Button size="xs" variant="light" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )

  if (!query.data.hasData)
    return (
      <div className="mt-6 flex h-[205px] flex-col items-center justify-center gap-3 rounded p-5 text-center text-xs text-stats-muted wide:h-[280px]">
        <Activity size={20} />
        <p>No samples in this time range.</p>
        <span className="text-[10px]">
          No history yet, or the service is not being scraped.
        </span>
      </div>
    )

  return <ChartResult panel={panel} data={query.data} />
}

function ChartResult({
  panel,
  data,
}: {
  panel: ChartDefinition
  data: PanelData
}) {
  const { type, ...options } = panel.chart ?? {}

  return (
    <>
      {panel.capacity && (
        <CapacityReadout
          sample={capacitySnapshot(panel.capacity, data.data)}
          format={panel.format}
          emptyLabel={panel.capacity.emptyLabel}
        />
      )}
      <TimeSeriesChart
        data={data.data}
        index="time"
        categories={data.categories}
        colors={data.colors}
        valueFormatter={panel.format}
        showLegend={data.categories.length > 1}
        stacked={panel.stacked}
        showShare={panel.showShare}
        variant={type}
        {...options}
        noDataText="No samples in this time range"
      />
    </>
  )
}

function sampleNumber(value: ChartRow[string]) {
  return Number.isFinite(value) ? Number(value) : null
}

function capacitySnapshot(capacity: ChartCapacity, data: ChartRow[]) {
  // Read related values from the same sample, never combine a fresh used value
  // with an older total or imply that missing history is current capacity.
  const row = data.findLast(
    row =>
      Number.isFinite(row[capacity.used]) &&
      Number.isFinite(row[capacity.total]),
  )

  if (!row) return null

  return {
    used: Number(row[capacity.used]),
    total: Number(row[capacity.total]),
    available: capacity.available
      ? sampleNumber(row[capacity.available])
      : null,
    collected: new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(row.timestamp * 1000)),
  }
}

export function ChartPanel({ panel, range, live }: PanelProps) {
  const [viewId, setViewId] = useState(panel.views?.[0]?.id)
  const view = panel.views?.find(option => option.id === viewId)

  const configured = useMemo(
    () => ({
      ...panel,
      ...view?.presentation,
      series: view?.series ?? panel.series,
    }),
    [panel, view],
  )

  const query = useQuery({
    queryKey: [
      'panel',
      panel.id,
      viewId,
      range.label,
      chartResolution(range.seconds, range.step).step,
    ],
    queryFn: ({ signal }) => loadPanel(configured, range, signal),
    refetchInterval: live ? 60000 : false,
  })

  return (
    <Panel
      className="pb-2.5 narrow:px-3.5 narrow:pt-[18px] mobile:px-4 mobile:pt-[19px]"
      id={panel.id}
    >
      <PanelHeader
        title={panel.title}
        description={panel.description}
        unit={
          configured.measurement === 'counter' && configured.unit !== '%'
            ? `${configured.unit} / ${chartResolution(range.seconds, range.step).label}`
            : configured.unit
        }
      />
      {panel.views && (
        <TabGroup
          className="mt-4"
          index={Math.max(
            0,
            panel.views.findIndex(option => option.id === viewId),
          )}
          onIndexChange={index => setViewId(panel.views?.[index]?.id)}
        >
          <TabList variant="solid" aria-label={`${panel.title} view`}>
            {panel.views.map(option => (
              <Tab className="flex-1" key={option.id}>
                {option.title}
              </Tab>
            ))}
          </TabList>
        </TabGroup>
      )}
      <ChartContent panel={configured} query={query} />
    </Panel>
  )
}
