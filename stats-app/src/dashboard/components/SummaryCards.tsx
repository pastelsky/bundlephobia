import { MetricCards, type MetricCard } from '../../components/ui/MetricCards'
import { Activity, ArrowDownLeft, Cable, ShieldAlert } from 'lucide-react'
import { compactFormat, numberFormat, formatBytes } from '../../lib/format'
import type { SummaryData, ResourceData, loadPipelineSummary } from '../metrics'

type SummaryCard = Omit<MetricCard, 'format' | 'detail'> &
  Partial<Pick<MetricCard, 'format' | 'detail'>>

function responseErrorShare(data?: SummaryData) {
  const total =
    data?.responses.reduce((sum, row) => sum + (row.count ?? 0), 0) ?? 0

  const errors = data?.responses.find(row => row.code === '5xx')?.count ?? 0

  return total > 0 ? (errors / total) * 100 : null
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
      color: 'orange',
    },
    {
      title: 'Request rate',
      value: data?.rate,
      format: (value: number) => `${numberFormat.format(value)}/s`,
      detail: 'Average over the last 5 minutes',
      icon: Activity,
      color: 'sky',
    },
    {
      title: 'Server error share',
      value: errorShare,
      format: (value: number) => `${numberFormat.format(value)}%`,
      detail: '5xx share of responses in this range',
      icon: ShieldAlert,
      color: 'rose',
    },
    {
      title: 'Open connections',
      value: data?.sessions,
      format: (value: number) => numberFormat.format(value),
      detail: 'Current sessions at the frontend',
      icon: Cable,
      color: 'violet',
    },
  ] as const

  return <MetricCards cards={cards} loading={loading} />
}

export function PipelineCards({
  data,
  loading,
}: {
  data?: Awaited<ReturnType<typeof loadPipelineSummary>>
  loading: boolean
}) {
  const { buildSuccess, buildFailure, installSuccess, installFailure } =
    data ?? {}

  const builds = [buildSuccess, buildFailure]
  const installs = [installSuccess, installFailure]

  const cards: SummaryCard[] = [
    {
      title: 'Successful builds',
      value: buildSuccess,
      tone: 'positive',
      detail: outcomeShare(buildSuccess, builds),
    },
    {
      title: 'Failed builds',
      value: buildFailure,
      tone: 'negative',
      detail: outcomeShare(buildFailure, builds),
    },
    {
      title: 'Successful installs',
      value: installSuccess,
      tone: 'positive',
      detail: outcomeShare(installSuccess, installs),
    },
    {
      title: 'Failed installs',
      value: installFailure,
      tone: 'negative',
      detail: outcomeShare(installFailure, installs),
    },
  ]

  return <ValueCards cards={cards} loading={loading} />
}

function outcomeShare(
  value: number | null | undefined,
  values: (number | null | undefined)[],
) {
  if (value == null || values.some(item => item == null)) return '—'
  const total = values.reduce<number>((sum, item) => sum + (item ?? 0), 0)

  return total > 0
    ? `${numberFormat.format((100 * value) / total)}% in selected period`
    : '—'
}

function ValueCards({
  cards,
  loading,
}: {
  cards: SummaryCard[]
  loading: boolean
}) {
  return (
    <MetricCards
      cards={cards.map(card => ({
        ...card,
        format: card.format ?? (value => compactFormat.format(value)),
        detail: card.detail ?? 'In the selected time range',
      }))}
      loading={loading}
    />
  )
}

export function ResourceCards({
  data,
  loading,
}: {
  data?: ResourceData
  loading: boolean
}) {
  const root = data?.disks.find(disk => disk.mount === 'root')

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
