import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { AreaChart, Card } from '@tremor/react'
import { Activity, ShieldAlert } from 'lucide-react'
import { loadPanel, type PanelDefinition } from '../metrics'
import type { TimeRange } from '../api'

type PanelData = Awaited<ReturnType<typeof loadPanel>>

interface PanelProps {
  panel: PanelDefinition
  range: TimeRange
  live: boolean
}

interface ContentProps {
  panel: PanelDefinition
  query: UseQueryResult<PanelData, Error>
}

const statusColors = new Map([
  ['1xx', 'slate'],
  ['2xx', 'emerald'],
  ['3xx', 'sky'],
  ['4xx', 'amber'],
  ['5xx', 'rose'],
  ['other', 'stone'],
])

const statusOrder = ['2xx', '3xx', '4xx', '5xx', '1xx', 'other']

function chartSeries(panel: PanelDefinition, data: PanelData) {
  if (panel.id !== 'responses')
    return { categories: data.categories, colors: panel.colors }

  const categories = statusOrder.filter(code => {
    if (!data.categories.includes(code)) return false

    if (!['1xx', 'other'].includes(code)) return true

    return data.data.some(row => Number(row[code] ?? 0) > 0)
  })

  return {
    categories,
    colors: categories.map(code => statusColors.get(code) ?? 'stone'),
  }
}

function ChartContent({ panel, query }: ContentProps) {
  if (query.isPending)
    return (
      <div
        className="chart-placeholder shimmer"
        aria-label={`Loading ${panel.title}`}
      />
    )

  if (query.isError)
    return (
      <div className="chart-placeholder panel-message" role="alert">
        <ShieldAlert size={20} />
        <p>{query.error.message}</p>
        <button type="button" onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    )

  if (!query.data.hasData)
    return (
      <div className="chart-placeholder panel-message">
        <Activity size={20} />
        <p>No samples in this time range.</p>
        <span>No history yet, or the service is not being scraped.</span>
      </div>
    )
  const series = chartSeries(panel, query.data)

  return (
    <AreaChart
      className="traffic-chart"
      data={query.data.data}
      index="time"
      categories={series.categories}
      colors={series.colors}
      valueFormatter={panel.format}
      stack={panel.stacked}
      showGradient={!panel.stacked}
      connectNulls={false}
      curveType="linear"
      showAnimation={false}
      showLegend={series.categories.length > 1}
      startEndOnly
      yAxisWidth={60}
      noDataText="No samples in this time range"
    />
  )
}

export function ChartPanel({ panel, range, live }: PanelProps) {
  const query = useQuery({
    queryKey: ['panel', panel.id, range.label],
    queryFn: ({ signal }) => loadPanel(panel, range, signal),
    refetchInterval: live ? 60000 : false,
  })

  return (
    <Card className="chart-card" id={panel.id}>
      <div className="panel-heading">
        <div>
          <h2>{panel.title}</h2>
          <p>{panel.description}</p>
        </div>
        <span className="unit-label">{panel.unit}</span>
      </div>
      <ChartContent panel={panel} query={query} />
    </Card>
  )
}
