import { PanelHeader } from '../ui/PanelHeader'
import motion from '../../styles/motion.module.css'
import styles from './ChartPanel.module.css'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { AreaChart, Button, Card } from '@tremor/react'
import { Activity, ShieldAlert } from 'lucide-react'
import { loadPanel } from '../../dashboard/metrics'
import type { ChartDefinition } from '../../dashboard/charts'
import type { TimeRange } from '../../lib/api'

type PanelData = Awaited<ReturnType<typeof loadPanel>>

interface PanelProps {
  panel: ChartDefinition
  range: TimeRange
  live: boolean
}

interface ContentProps {
  panel: ChartDefinition
  query: UseQueryResult<PanelData, Error>
}

function ChartContent({ panel, query }: ContentProps) {
  if (query.isPending)
    return (
      <div
        className={styles.chartPlaceholder + ' ' + motion.shimmer}
        aria-label={`Loading ${panel.title}`}
      />
    )

  if (query.isError)
    return (
      <div
        className={styles.chartPlaceholder + ' ' + styles.panelMessage}
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
      <div className={styles.chartPlaceholder + ' ' + styles.panelMessage}>
        <Activity size={20} />
        <p>No samples in this time range.</p>
        <span>No history yet, or the service is not being scraped.</span>
      </div>
    )
  const series = query.data

  return (
    <AreaChart
      className={`${styles.trafficChart} ${panel.stacked ? styles.stacked : ''}`}
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
    <Card className={styles.chartCard} id={panel.id}>
      <PanelHeader
        title={panel.title}
        description={panel.description}
        unit={panel.unit}
      />
      <ChartContent panel={panel} query={query} />
    </Card>
  )
}
