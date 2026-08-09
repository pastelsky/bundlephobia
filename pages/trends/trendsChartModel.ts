import { scaleLinear } from 'd3-scale'
import { curveMonotoneX, line, linkHorizontal } from 'd3-shape'

import type {
  TrendsGroupBy,
  TrendsMetric,
  TrendsPackageSeries,
  TrendsPoint,
} from '../../client/api'
import { formatSize } from '../../utils'

export const CHART_HEIGHT = 380
export const INITIAL_CHART_WIDTH = 1000
export const PLOT = { top: 12, right: 0, bottom: 34, left: 0 }

export const TRENDS_SERIES_COLORS = [
  '#3b82f6',
  '#10b981',
  '#ec4899',
  '#06b6d4',
  '#8b5cf6',
]

export type ChartPoint = TrendsPoint & { x: number; y: number }
export type ChartSeries = {
  name: string
  color: string
  points: ChartPoint[]
  partialPoints: ChartPoint[]
  partialMarkers: ChartPoint[]
  markers: ChartPoint[]
}

export type SeriesAnnotation = {
  name: string
  color: string
  point: ChartPoint
  labelX: number
  labelY: number
}

export type FormattedMetricValue = { value: string; unit: string }

export function seriesForMetric(
  pack: TrendsPackageSeries,
  metric: TrendsMetric
) {
  switch (metric) {
    case 'downloads':
      return pack.downloads
    case 'stars':
      return pack.stars
    case 'issues':
      return pack.issues
    case 'size':
      return pack.size
  }
}

export function formatMetricValue(
  value: number,
  metric: TrendsMetric
): FormattedMetricValue {
  const trimZeros = (formatted: string) => formatted.replace(/\.?0+$/, '')
  if (metric === 'size') {
    const formatted = formatSize(value)
    return {
      value: trimZeros(formatted.size.toFixed(formatted.unit === 'B' ? 0 : 1)),
      unit: formatted.unit,
    }
  }
  if (value >= 1_000_000)
    return { value: trimZeros((value / 1_000_000).toFixed(2)), unit: 'M' }
  if (value >= 1_000)
    return { value: trimZeros((value / 1_000).toFixed(1)), unit: 'k' }
  return { value: `${Math.round(value)}`, unit: '' }
}

export function formatDateTick(date: Date) {
  const parts = new Intl.DateTimeFormat('en', {
    month: 'short',
    year: '2-digit',
  }).formatToParts(date)
  const month = parts.find(part => part.type === 'month')?.value
  const year = parts.find(part => part.type === 'year')?.value
  return `${month} '${year}`
}

export function pathFor(points: ChartPoint[]) {
  return (
    line<ChartPoint>()
      .x(point => point.x)
      .y(point => point.y)
      .curve(curveMonotoneX)(points) || ''
  )
}

export function annotationPath(annotation: SeriesAnnotation) {
  return (
    linkHorizontal<
      { source: { x: number; y: number }; target: { x: number; y: number } },
      { x: number; y: number }
    >()
      .x(point => point.x)
      .y(point => point.y)({
      source: annotation.point,
      target: { x: annotation.labelX - 5, y: annotation.labelY + 4 },
    }) || ''
  )
}

export function partialLinkThreshold(groupBy: TrendsGroupBy) {
  if (groupBy === 'day') return 2 * 24 * 60 * 60 * 1000
  if (groupBy === 'week') return 10 * 24 * 60 * 60 * 1000
  return 45 * 24 * 60 * 60 * 1000
}

export function buildChartModel({
  packages,
  metric,
  groupBy,
  showMajorReleases,
  showMinorReleases,
  chartWidth,
}: {
  packages: TrendsPackageSeries[]
  metric: TrendsMetric
  groupBy: TrendsGroupBy
  showMajorReleases: boolean
  showMinorReleases: boolean
  chartWidth: number
}) {
  const rawSeries = packages.map((pack, index) => ({
    name: pack.name,
    color: TRENDS_SERIES_COLORS[index % TRENDS_SERIES_COLORS.length],
    points: seriesForMetric(pack, metric),
    releases: pack.releases,
  }))
  const allPoints = rawSeries.flatMap(series => series.points)
  if (allPoints.length === 0) return null

  const timestamps = allPoints.map(point => Date.parse(point.date))
  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const values = allPoints.map(point => point.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const valuePadding = Math.max(
    (maxValue - minValue) * 0.08,
    maxValue * 0.02,
    1
  )
  const plotWidth = chartWidth - PLOT.left - PLOT.right
  const plotHeight = CHART_HEIGHT - PLOT.top - PLOT.bottom
  const yScale = scaleLinear()
    .domain([Math.max(0, minValue - valuePadding), maxValue + valuePadding])
    .nice(4)
    .range([PLOT.top + plotHeight, PLOT.top])
  const xFor = (date: string) => {
    if (maxTime === minTime) return PLOT.left + plotWidth / 2
    return (
      PLOT.left +
      ((Date.parse(date) - minTime) / (maxTime - minTime)) * plotWidth
    )
  }
  const yFor = (value: number) => yScale(value)
  const toChartPoint = (point: TrendsPoint): ChartPoint => ({
    ...point,
    x: xFor(point.date),
    y: yFor(point.value),
  })

  const series: ChartSeries[] = rawSeries.map(raw => {
    const complete = raw.points.filter(point => !point.partial)
    const partial = raw.points.filter(point => point.partial)
    const partialStart = partial[0]
      ? complete.filter(point => point.date < partial[0].date).at(-1)
      : undefined
    const plotted = complete.map(toChartPoint)
    const partialMarkers = partial.map(toChartPoint)
    const canJoinPartial =
      partialStart &&
      partial[0] &&
      Date.parse(partial[0].date) - Date.parse(partialStart.date) <=
        partialLinkThreshold(groupBy)
    return {
      name: raw.name,
      color: raw.color,
      points: plotted,
      partialPoints:
        canJoinPartial && partial.length
          ? [partialStart, ...partial].map(toChartPoint)
          : [],
      partialMarkers,
      markers: plotted,
    }
  })

  const releaseLines = rawSeries.flatMap(raw =>
    raw.releases
      .filter(release =>
        release.major ? showMajorReleases : showMinorReleases
      )
      .filter(release => {
        const time = Date.parse(release.date)
        return time >= minTime && time <= maxTime
      })
      .map(release => ({
        ...release,
        color: raw.color,
        x: xFor(release.date),
        label: `${raw.name} v${release.version} (${
          release.major ? 'Major' : 'Minor'
        })`,
      }))
  )

  const labelGap = 28
  const labelTop = PLOT.top + 16
  const labelBottom = PLOT.top + plotHeight - 12
  const candidates = series
    .map(item => ({
      name: item.name,
      color: item.color,
      point: [...item.points, ...item.partialMarkers].reduce<
        ChartPoint | undefined
      >(
        (highest, point) => (!highest || point.y < highest.y ? point : highest),
        undefined
      ),
    }))
    .filter(
      (candidate): candidate is Omit<SeriesAnnotation, 'labelX' | 'labelY'> =>
        Boolean(candidate.point)
    )
    .sort((a, b) => a.point.y - b.point.y)
  let previousLabelY = labelTop - labelGap
  const seriesAnnotations = candidates.map(candidate => {
    const labelY = Math.max(
      labelTop,
      Math.min(labelBottom, candidate.point.y - 46),
      previousLabelY + labelGap
    )
    previousLabelY = labelY
    return {
      ...candidate,
      labelX:
        candidate.point.x +
        Math.max(42, Math.min(96, (chartWidth - candidate.point.x) * 0.5)),
      labelY,
    }
  })
  const overflow = Math.max(0, previousLabelY - labelBottom)
  if (overflow)
    seriesAnnotations.forEach(annotation => (annotation.labelY -= overflow))
  const xTickCount = Math.max(3, Math.min(10, Math.floor(plotWidth / 120) + 1))

  return {
    series,
    seriesAnnotations,
    minTime,
    maxTime,
    yTicks: yScale.ticks(4),
    xTicks: Array.from(
      {
        // Date labels need roughly 120px at the current type scale. This makes
        // a three-year monthly view informative on desktop without allowing
        // labels to collide on a narrow screen.
        length: xTickCount,
      },
      (_, index) =>
        new Date(minTime + ((maxTime - minTime) * index) / (xTickCount - 1))
    ),
    releaseLines,
    xFor,
    yFor,
    plotWidth,
    plotHeight,
  }
}

export type TrendsChartModel = NonNullable<ReturnType<typeof buildChartModel>>
