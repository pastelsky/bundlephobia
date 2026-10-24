import { useMemo, useState } from 'react'
import { numberFormat } from '../../lib/format'
import { PanelHeader } from '../ui/PanelHeader'
import motion from '../../styles/motion.module.css'
import styles from './ChartPanel.module.css'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  AreaChart,
  Badge,
  Button,
  Card,
  LineChart,
  ProgressBar,
  Tab,
  TabGroup,
  TabList,
  type LineChartProps,
} from '@tremor/react'
import { Activity, ShieldAlert } from 'lucide-react'
import { loadPanel, type ChartRow } from '../../dashboard/metrics'
import type { ChartCapacity, ChartDefinition } from '../../dashboard/charts'
import { chartResolution, type TimeRange } from '../../lib/api'

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

  return (
    <>
      {panel.capacity && (
        <CapacityReadout
          capacity={panel.capacity}
          data={query.data.data}
          format={panel.format}
        />
      )}
      <TimeSeriesChart panel={panel} data={query.data} />
      <p className={styles.resolutionNote}>
        {panel.measurement === 'counter' ? 'Totals per' : 'Sampled every'}{' '}
        {query.data.resolution.label}
      </p>
    </>
  )
}

function TimeSeriesChart({
  panel,
  data,
}: {
  panel: ChartDefinition
  data: PanelData
}) {
  const { type, ...options } = panel.chart ?? {}

  const props: LineChartProps = {
    className: `${styles.trafficChart} ${panel.stacked ? styles.stacked : ''}`,
    data: data.data,
    index: 'time',
    categories: data.categories,
    colors: data.colors,
    valueFormatter: panel.format,
    connectNulls: false,
    curveType: 'linear',
    showAnimation: false,
    showLegend: data.categories.length > 1,
    enableLegendSlider: true,
    startEndOnly: true,
    minValue: 0,
    yAxisWidth: 60,
    noDataText: 'No samples in this time range',
    ...options,
  }

  if (type === 'line') return <LineChart {...props} />

  return (
    <AreaChart {...props} stack={panel.stacked} showGradient={!panel.stacked} />
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

function CapacityReadout({
  capacity,
  data,
  format,
}: {
  capacity: ChartCapacity
  data: ChartRow[]
  format: (value: number) => string
}) {
  const sample = capacitySnapshot(capacity, data)

  if (!sample) return null

  if (sample.total <= 0)
    return (
      <p className={styles.capacityNote}>
        {capacity.emptyLabel ?? 'No capacity reported'}
      </p>
    )

  const percent = (sample.used / sample.total) * 100

  return (
    <div className={styles.capacityReadout}>
      <div className={styles.capacityHeading}>
        <p>
          <strong>{format(sample.used)}</strong> of {format(sample.total)} used
        </p>
        <Badge color="slate" size="xs">
          {numberFormat.format(percent)}%
        </Badge>
      </div>
      <ProgressBar
        value={Math.max(0, Math.min(100, percent))}
        color="orange"
        showAnimation={false}
        tooltip={`${numberFormat.format(percent)}% used`}
        aria-label="Capacity used"
      />
      <div className={styles.capacityNote}>
        {sample.available != null && (
          <span>{format(sample.available)} available</span>
        )}
        <span>Latest sample · {sample.collected}</span>
      </div>
    </div>
  )
}

export function ChartPanel({ panel, range, live }: PanelProps) {
  const [viewId, setViewId] = useState(panel.views?.[0]?.id)
  const view = panel.views?.find(option => option.id === viewId)

  const configured = useMemo(
    () => ({ ...panel, series: view?.series ?? panel.series }),
    [panel, view],
  )

  const query = useQuery({
    queryKey: ['panel', panel.id, viewId, range.label],
    queryFn: ({ signal }) => loadPanel(configured, range, signal),
    refetchInterval: live ? 60000 : false,
  })

  return (
    <Card className={styles.chartCard} id={panel.id}>
      <PanelHeader
        title={panel.title}
        description={panel.description}
        unit={
          panel.measurement === 'counter'
            ? `${panel.unit} / ${chartResolution(range.seconds).label}`
            : panel.unit
        }
      />
      {panel.views && (
        <TabGroup
          className={styles.chartViews}
          index={Math.max(
            0,
            panel.views.findIndex(option => option.id === viewId),
          )}
          onIndexChange={index => setViewId(panel.views?.[index]?.id)}
        >
          <TabList variant="solid" aria-label={`${panel.title} filesystem`}>
            {panel.views.map(option => (
              <Tab key={option.id}>{option.title}</Tab>
            ))}
          </TabList>
        </TabGroup>
      )}
      <ChartContent panel={configured} query={query} />
    </Card>
  )
}
