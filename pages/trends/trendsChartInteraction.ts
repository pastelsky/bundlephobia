import { bisector } from 'd3-array'

import type {
  TrendsMetric,
  TrendsPackageSeries,
  TrendsPoint,
} from '../../client/api'
import {
  type ChartPoint,
  PLOT,
  TRENDS_SERIES_COLORS,
  type buildChartModel,
  seriesForMetric,
} from './trendsChartModel'

type ChartModel = NonNullable<ReturnType<typeof buildChartModel>>

const DOT_MAGNET_RADIUS = 9

export type Hover = {
  x: number
  cursorX: number
  cursorY: number
  timestamp: number
  pointDate?: string
}

type TooltipPoint = TrendsPoint & { placeholder?: boolean }

export const nearestTimestamp = bisector<{ timestamp: number }, number>(
  point => point.timestamp,
).center

const nearestX = bisector<ChartPoint, number>(point => point.x).center

export function hoverAt(
  cursor: { x: number; y: number },
  rect: DOMRect,
  plot: {
    model: ChartModel
    points: ChartPoint[]
  },
): Hover | null {
  if (!rect.width) return null

  const { model, points } = plot
  const chartWidth = model.plotWidth + PLOT.left + PLOT.right
  const relativeX = ((cursor.x - rect.left) / rect.width) * chartWidth

  const clampedX = Math.max(
    PLOT.left,
    Math.min(PLOT.left + model.plotWidth, relativeX),
  )

  const nearest = points[nearestX(points, clampedX)]

  const magneticPoint =
    nearest && Math.abs(nearest.x - clampedX) <= DOT_MAGNET_RADIUS
      ? nearest
      : null

  return {
    x: magneticPoint?.x ?? clampedX,
    cursorX: rect.left + (clampedX / chartWidth) * rect.width,
    cursorY: cursor.y,
    timestamp: magneticPoint
      ? Date.parse(magneticPoint.date)
      : model.getTimestampAtX(clampedX),
    pointDate: magneticPoint?.date,
  }
}

export function buildHoverIndex(
  model: ChartModel,
  packages: TrendsPackageSeries[],
  metric: TrendsMetric,
) {
  const pointsByDate = new Map<
    string,
    { point: ChartPoint; color: string; seriesIndex: number }[]
  >()

  const points: ChartPoint[] = []

  model.series.forEach((series, seriesIndex) => {
    for (const point of [
      ...series.points,
      ...series.partialMarkers,
      ...series.releaseMarkers,
    ]) {
      if (!Number.isFinite(point.x)) continue

      points.push(point)
      const entry = { point, color: series.color, seriesIndex }
      const day = pointsByDate.get(point.date)

      if (day) day.push(entry)
      else pointsByDate.set(point.date, [entry])
    }
  })

  const tooltipSeries = packages.map((pack, index) => ({
    name: pack.name,
    color: TRENDS_SERIES_COLORS[index % TRENDS_SERIES_COLORS.length],
    points: [
      ...seriesForMetric(pack, metric),
      ...(model.series[index]?.releaseMarkers ?? []),
    ]
      .map((point: TooltipPoint) => ({
        point,
        timestamp: Date.parse(point.date),
      }))
      .sort((left, right) => left.timestamp - right.timestamp),
  }))

  return {
    points: points.sort((left, right) => left.x - right.x),
    pointsByDate,
    dates: [...pointsByDate.keys()].sort(),
    tooltipSeries,
  }
}

export type HoverIndex = ReturnType<typeof buildHoverIndex>
