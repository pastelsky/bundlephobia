/* eslint-disable max-params, anti-slop/no-array-filter-map */

import { extent } from 'd3-array'
import { scaleLinear, scaleTime } from 'd3-scale'
import { curveMonotoneX, line } from 'd3-shape'
import {
  getTime,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

import type {
  TrendsGroupBy,
  TrendsMetric,
  TrendsPackageSeries,
  TrendsPoint,
  TrendsRange,
} from '../../client/api'
import { formatSize } from '../../utils'
import { startOfTrendsRange } from '../../utils/trends'

export const CHART_HEIGHT = 380

export const INITIAL_CHART_WIDTH = 1000

export const PLOT = { top: 12, right: 0, bottom: 34, left: 0 }

const MIN_MARKER_GAP = 8

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

type ChartSeries = {
  renderKey: string
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
  metric: TrendsMetric,
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
  metric: TrendsMetric,
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

function partialLinkThreshold(groupBy: TrendsGroupBy) {
  if (groupBy === 'day') return 2 * 24 * 60 * 60 * 1000

  if (groupBy === 'week') return 10 * 24 * 60 * 60 * 1000

  return 45 * 24 * 60 * 60 * 1000
}

function getRangeStartTimestamp(range: TrendsRange) {
  return getTime(startOfDay(startOfTrendsRange(range)))
}

function alignToGroupStart(timestamp: number, groupBy: TrendsGroupBy) {
  const date = new Date(timestamp)

  if (groupBy === 'month') return getTime(startOfMonth(date))

  if (groupBy === 'week') return getTime(startOfWeek(date, { weekStartsOn: 1 }))

  return timestamp
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

  // Release metadata cannot form a meaningful chart on its own. In
  // particular, size history may be unavailable while releases are present;
  // continuing with an empty value domain produces NaN SVG coordinates.
  if (allPoints.length === 0) return null

  // Keep the axis within the requested range while removing empty leading
  // space when an upstream source returns less history than requested. Align
  // to the bucket boundary because monthly/weekly points can be dated before
  // the exact requested start (for example, Sep 1 for a Sep 23 request).
  const requestedMinTime = getRangeStartTimestamp(range)

  const pointTimes = allPoints
    .map(point => getTime(parseISO(point.date)))
    .filter(Number.isFinite)

  if (pointTimes.length === 0) return null

  const [earliestPointTime] = extent(pointTimes)

  if (earliestPointTime === undefined) return null

  const minTime = alignToGroupStart(
    Math.max(requestedMinTime, earliestPointTime),
    groupBy,
  )

  const maxTime = getTime(startOfDay(new Date()))
  const [minValue, maxValue] = extent(allPoints, point => point.value)

  if (minValue === undefined || maxValue === undefined) return null

  const valuePadding = Math.max(
    (maxValue - minValue) * 0.08,
    maxValue * 0.02,
    1,
  )

  const plotWidth = chartWidth - PLOT.left - PLOT.right
  const plotHeight = CHART_HEIGHT - PLOT.top - PLOT.bottom

  const yScale = scaleLinear()
    .domain([Math.max(0, minValue - valuePadding), maxValue + valuePadding])
    .nice(4)
    .range([PLOT.top + plotHeight, PLOT.top])

  const xScale = scaleTime()
    .domain([new Date(minTime), new Date(maxTime)])
    .range([PLOT.left, PLOT.left + plotWidth])

  const xFor = (date: string) => xScale(parseISO(date))
  const xForDate = (date: Date) => xScale(date)
  const timestampForX = (x: number) => getTime(xScale.invert(x))

  const yFor = (value: number) => yScale(value)

  const toChartPoint = (
    point: TrendsPoint & { placeholder?: boolean },
  ): ChartPoint => ({
    ...point,
    x: xFor(point.date),
    y: yFor(point.value),
  })

  const releaseIsVisible = (release: { major: boolean }) =>
    release.major ? showMajorReleases : showMinorReleases

  const releaseIsInRange = (release: { date: string }) => {
    const time = getTime(parseISO(release.date))

    return time >= minTime && time <= maxTime
  }

  const releaseMarkersFor = (raw: (typeof rawSeries)[number]) => {
    if (metric !== 'size') return []

    return raw.releases
      .filter(releaseIsVisible)
      .filter(releaseIsInRange)
      .filter(
        release => !raw.points.some(point => point.version === release.version),
      )
      .map(release =>
        toChartPoint({
          date: release.date,
          value: minValue,
          version: release.version,
          placeholder: true,
        }),
      )
  }

  const partialPointsFor = (
    complete: TrendsPoint[],
    partial: TrendsPoint[],
  ) => {
    const firstPartial = partial[0]

    if (!firstPartial) return []

    const partialStart = complete
      .filter(point => point.date < firstPartial.date)
      .at(-1)

    if (!partialStart) return []

    const gap =
      getTime(parseISO(firstPartial.date)) -
      getTime(parseISO(partialStart.date))

    return gap <= partialLinkThreshold(groupBy)
      ? [partialStart, ...partial].map(toChartPoint)
      : []
  }

  const series: ChartSeries[] = rawSeries.map(raw => {
    const complete = raw.points.filter(point => !point.partial)
    const partial = raw.points.filter(point => point.partial)

    const plotted = complete.map(toChartPoint)
    const partialMarkers = partial.map(toChartPoint)

    return {
      renderKey: [
        raw.name,
        metric,
        range,
        groupBy,
        raw.points.length,
        raw.points.at(-1)?.date,
      ].join(':'),
      name: raw.name,
      color: raw.color,
      points: plotted,
      partialPoints: partialPointsFor(complete, partial),
      partialMarkers,
      // Dense lines are clearer without indistinguishable point markers. The
      // full-resolution points remain available for paths and interaction.
      markers: plotted.length * MIN_MARKER_GAP <= plotWidth ? plotted : [],
      releaseMarkers: releaseMarkersFor(raw),
    }
  })

  const releaseLines = rawSeries.flatMap(raw =>
    raw.releases
      .filter(releaseIsVisible)
      .filter(releaseIsInRange)
      .map(release => ({
        ...release,
        color: raw.color,
        x: xFor(release.date),
        label: `${raw.name} v${release.version} (${
          release.major ? 'Major' : 'Minor'
        })`,
      })),
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
        undefined,
      ),
    }))
    .filter(
      (candidate): candidate is Omit<SeriesAnnotation, 'labelX' | 'labelY'> =>
        Boolean(candidate.point),
    )
    .sort((a, b) => a.point.y - b.point.y)

  let previousLabelY = labelTop - labelGap

  const seriesAnnotations = candidates.map(candidate => {
    const labelY = Math.max(
      labelTop,
      Math.min(labelBottom, candidate.point.y - 46),
      previousLabelY + labelGap,
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

  const maxTickCount = Math.max(
    3,
    Math.min(10, Math.floor(plotWidth / 120) + 1),
  )

  return {
    series,
    seriesAnnotations,
    minTime,
    maxTime,
    yTicks: yScale.ticks(4),
    xTicks: xScale.ticks(maxTickCount),
    releaseLines,
    xFor,
    xForDate,
    timestampForX,
    yFor,
    plotWidth,
    plotHeight,
  }
}
