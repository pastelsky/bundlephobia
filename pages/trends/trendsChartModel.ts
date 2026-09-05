import { scaleLinear } from 'd3-scale'
import { curveMonotoneX, line } from 'd3-shape'

import type {
  TrendsGroupBy,
  TrendsMetric,
  TrendsPackageSeries,
  TrendsPoint,
  TrendsRange,
} from '../../client/api'
import { formatSize } from '../../utils'

export const CHART_HEIGHT = 380
export const INITIAL_CHART_WIDTH = 1000
export const PLOT = { top: 12, right: 0, bottom: 34, left: 0 }

export const TRENDS_SERIES_COLORS = [
  'var(--trends-series-1)',
  'var(--trends-series-2)',
  'var(--trends-series-3)',
  'var(--trends-series-4)',
  'var(--trends-series-5)',
]

export type ChartPoint = TrendsPoint & {
  x: number
  y: number
  placeholder?: boolean
}
export type ChartSeries = {
  name: string
  color: string
  points: ChartPoint[]
  partialPoints: ChartPoint[]
  partialMarkers: ChartPoint[]
  markers: ChartPoint[]
  releaseMarkers: ChartPoint[]
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
  const targetX = annotation.labelX - 5
  const targetY = annotation.labelY + 4
  const controlX = annotation.point.x + (targetX - annotation.point.x) * 0.72
  return `M ${annotation.point.x} ${annotation.point.y} Q ${controlX} ${targetY} ${targetX} ${targetY}`
}

export function partialLinkThreshold(groupBy: TrendsGroupBy) {
  if (groupBy === 'day') return 2 * 24 * 60 * 60 * 1000
  if (groupBy === 'week') return 10 * 24 * 60 * 60 * 1000
  return 45 * 24 * 60 * 60 * 1000
}

function getRangeStartTimestamp(range: TrendsRange) {
  const start = new Date()
  if (range === 'last-2-months') {
    start.setUTCMonth(start.getUTCMonth() - 2)
  } else if (range === 'last-year') {
    start.setUTCFullYear(start.getUTCFullYear() - 1)
  } else {
    start.setUTCFullYear(start.getUTCFullYear() - 3)
  }
  return Date.parse(start.toISOString().slice(0, 10))
}

function buildXAxisTicks(
  minTime: number,
  maxTime: number,
  groupBy: TrendsGroupBy,
  plotWidth: number
) {
  const maxTickCount = Math.max(
    3,
    Math.min(10, Math.floor(plotWidth / 120) + 1)
  )

  if (groupBy === 'month') {
    const candidates = [new Date(minTime)]
    const cursor = new Date(minTime)
    cursor.setUTCDate(1)
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    while (cursor.getTime() <= maxTime) {
      candidates.push(new Date(cursor))
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }

    if (candidates.length <= maxTickCount) return candidates

    return Array.from({ length: maxTickCount }, (_, index) => {
      const candidateIndex = Math.round(
        (index * (candidates.length - 1)) / (maxTickCount - 1)
      )
      return candidates[candidateIndex]
    })
  }

  return Array.from(
    { length: maxTickCount },
    (_, index) =>
      new Date(minTime + ((maxTime - minTime) * index) / (maxTickCount - 1))
  )
}

export function buildChartModel({
  packages,
  metric,
  range,
  groupBy,
  showMajorReleases,
  showMinorReleases,
  chartWidth,
}: {
  packages: TrendsPackageSeries[]
  metric: TrendsMetric
  range: TrendsRange
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
  const releaseCandidates = rawSeries.flatMap(raw =>
    metric === 'size'
      ? raw.releases.filter(release =>
          release.major ? showMajorReleases : showMinorReleases
        )
      : []
  )
  if (allPoints.length === 0 && releaseCandidates.length === 0) return null

  // Keep the coordinate system tied to the requested range, not to whichever
  // series happens to have data. Otherwise a sparse metric collapses the whole
  // x-axis to one date and every generated month label overlaps.
  const minTime = getRangeStartTimestamp(range)
  const maxTime = Date.parse(new Date().toISOString().slice(0, 10))
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
  const toChartPoint = (
    point: TrendsPoint & { placeholder?: boolean }
  ): ChartPoint => ({
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
    const releaseMarkers =
      metric === 'size'
        ? raw.releases
            .filter(release =>
              release.major ? showMajorReleases : showMinorReleases
            )
            .filter(release => {
              const time = Date.parse(release.date)
              return (
                time >= minTime &&
                time <= maxTime &&
                !raw.points.some(point => point.version === release.version)
              )
            })
            .map(release =>
              toChartPoint({
                date: release.date,
                value: minValue,
                version: release.version,
                placeholder: true,
              })
            )
        : []
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
      releaseMarkers,
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
  return {
    series,
    seriesAnnotations,
    minTime,
    maxTime,
    yTicks: yScale.ticks(4),
    xTicks: buildXAxisTicks(minTime, maxTime, groupBy, plotWidth),
    releaseLines,
    xFor,
    yFor,
    plotWidth,
    plotHeight,
  }
}

export type TrendsChartModel = NonNullable<ReturnType<typeof buildChartModel>>
