import { Card, Metric, Text } from '@tremor/react'
import { Activity, ArrowDownLeft, Cable, ShieldAlert } from 'lucide-react'
import {
  compactFormat,
  numberFormat,
  formatBytes,
  type SummaryData,
  type ResourceData,
  type loadPipelineSummary,
} from '../metrics'

function responseErrorShare(data?: SummaryData) {
  const total =
    data?.responses.reduce((sum, row) => sum + (row.count ?? 0), 0) ?? 0

  const errors = data?.responses.find(row => row.code === '5xx')?.count ?? 0

  return total > 0 ? (errors / total) * 100 : null
}

function resourceDisks(data?: ResourceData) {
  return data?.disks ?? []
}

function optionalBytes(value?: number | null) {
  return value == null ? '—' : formatBytes(value)
}

export function SummaryCards({
  data,
  loading,
}: {
  data?: SummaryData
  loading: boolean
}) {
  const errorShare = responseErrorShare(data)

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

export function PipelineCards({
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

export function ResourceCards({
  data,
  loading,
}: {
  data?: ResourceData
  loading: boolean
}) {
  const root = resourceDisks(data).find(disk => disk.mount === 'root')

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
      detail: cpuLoadDetail(data),
    },
    {
      title: 'Memory used',
      value: data?.memoryUsed,
      format: formatBytes,
      detail: `${optionalBytes(data?.memoryTotal)} total RAM · cache excluded`,
    },
    {
      title: 'Main disk available',
      value: root?.available,
      format: formatBytes,
      detail: `${optionalBytes(root?.total)} total capacity`,
    },
  ]

  return <ValueCards cards={cards} loading={loading} />
}

function cpuLoadDetail(data?: ResourceData) {
  return `1-minute load · ${data?.cores ?? '—'} CPU cores`
}
