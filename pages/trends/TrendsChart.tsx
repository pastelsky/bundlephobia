/* eslint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-array-filter-map */

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import anime from 'animejs'
import { bisector } from 'd3-array'

import type {
  TrendsGroupBy,
  TrendsMetric,
  TrendsPackageSeries,
  TrendsPoint,
  TrendsRange,
} from '../../client/api'
import TrendsLoader from './TrendsLoader'
import {
  CHART_HEIGHT,
  type ChartPoint,
  INITIAL_CHART_WIDTH,
  PLOT,
  TRENDS_SERIES_COLORS,
  buildChartModel,
  formatMetricValue,
  seriesForMetric,
} from './trendsChartModel'

import TrendsPlot from './TrendsPlot'

export { TRENDS_SERIES_COLORS } from './trendsChartModel'

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : useLayoutEffect

const CHART_EASING = 'easeOutCubic'

const DOT_MAGNET_RADIUS = 9

type TrendsChartProps = {
  packages: TrendsPackageSeries[]
  metric: TrendsMetric
  range: TrendsRange
  groupBy: TrendsGroupBy
  showMajorReleases: boolean
  showMinorReleases: boolean
  actions?: React.ReactNode
  loading?: boolean
  pending?: boolean
}

type Hover = {
  x: number
  cursorX: number
  cursorY: number
  timestamp: number
  pointDate?: string
}

type TooltipPoint = TrendsPoint & { placeholder?: boolean }

const nearestTimestamp = bisector<{ timestamp: number }, number>(
  point => point.timestamp,
).center

const nearestX = bisector<ChartPoint, number>(point => point.x).center

function hoverAt(
  cursor: { x: number; y: number },
  rect: DOMRect,
  plot: {
    model: NonNullable<ReturnType<typeof buildChartModel>>
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
      : model.timestampForX(clampedX),
    pointDate: magneticPoint?.date,
  }
}

// The remaining branches are declarative chart layers and loading states;
// coordinate, grouping, and interaction logic live in focused helpers.
// eslint-disable-next-line complexity
export default function TrendsChart({
  packages,
  metric,
  range,
  groupBy,
  showMajorReleases,
  showMinorReleases,
  actions,
  loading = false,
  pending = false,
}: TrendsChartProps) {
  const [mounted, setMounted] = useState(false)
  const [showLoader, setShowLoader] = useState(loading && packages.length === 0)

  const [hover, setHover] = useState<Hover | null>(null)
  const [keyboardIndex, setKeyboardIndex] = useState<number | null>(null)
  const pointerFrame = useRef<number | null>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)

  const chartSeriesRef = useRef<HTMLDivElement>(null)
  const loaderRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(INITIAL_CHART_WIDTH)

  const incrementalLoading = loading && packages.length > 0

  React.useEffect(() => {
    const chart = chartSeriesRef.current

    if (!chart) return

    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = Math.round(entry.contentRect.width)

      if (nextWidth > 0) setChartWidth(nextWidth)
    })

    observer.observe(chart)

    return () => observer.disconnect()
  }, [mounted])

  useIsomorphicLayoutEffect(() => {
    if (loading && !incrementalLoading) {
      setShowLoader(true)

      return
    }

    if (incrementalLoading) {
      setShowLoader(false)

      return
    }

    if (!showLoader || !chartSeriesRef.current || !loaderRef.current) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShowLoader(false)

      return
    }

    const chartAnimation = anime({
      targets: chartSeriesRef.current,
      opacity: [0, 1],
      translateY: [6, 0],
      duration: 360,
      easing: CHART_EASING,
    })

    const loaderAnimation = anime({
      targets: loaderRef.current,
      opacity: [1, 0],
      translateY: [0, -4],
      duration: 240,
      easing: CHART_EASING,
      complete: () => setShowLoader(false),
    })

    return () => {
      chartAnimation.pause()
      loaderAnimation.pause()
    }
  }, [incrementalLoading, loading, showLoader])

  React.useEffect(() => setMounted(true), [])

  const model = useMemo(
    () =>
      buildChartModel({
        packages,
        metric,
        range,
        groupBy,
        showMajorReleases,
        showMinorReleases,
        chartWidth,
      }),
    [
      packages,
      metric,
      range,
      groupBy,
      showMajorReleases,
      showMinorReleases,
      chartWidth,
    ],
  )

  const hoverIndex = useMemo(() => {
    if (!model) return null

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
  }, [metric, model, packages])

  // Cancel work queued for the old plot when the data or viewport changes.
  useIsomorphicLayoutEffect(
    () => () => {
      if (pointerFrame.current !== null) {
        cancelAnimationFrame(pointerFrame.current)
        pointerFrame.current = null
      }
    },
    [model],
  )

  useIsomorphicLayoutEffect(() => {
    const tooltip = tooltipRef.current

    if (!hover || !tooltip) return

    const gap = 14
    const maxLeft = window.innerWidth - tooltip.offsetWidth - 8
    const left = Math.max(8, Math.min(hover.cursorX + gap, maxLeft))
    const below = hover.cursorY + gap

    const top =
      below + tooltip.offsetHeight <= window.innerHeight - 8
        ? below
        : Math.max(8, hover.cursorY - tooltip.offsetHeight - gap)

    tooltip.style.transform = `translate3d(${left}px, ${top}px, 0)`
  }, [hover, chartWidth])

  const keyboardPointIndex = Math.min(
    keyboardIndex ?? Infinity,
    (hoverIndex?.dates.length ?? 0) - 1,
  )

  const keyboardDate = hoverIndex?.dates[keyboardPointIndex]

  const keyboardValue = useMemo(() => {
    if (!keyboardDate || !hoverIndex) return undefined

    const time = Date.parse(keyboardDate)

    const values = hoverIndex.tooltipSeries.map(series => {
      const point = series.points[nearestTimestamp(series.points, time)]?.point

      if (!point || point.placeholder) return `${series.name}: unavailable`

      const { value, unit } = formatMetricValue(point.value, metric)

      return `${series.name}: ${value}${unit}`
    })

    return [keyboardDate, ...values].join(', ')
  }, [hoverIndex, keyboardDate, metric])

  const exploreDate = (index: number) => {
    if (!hoverIndex || !svgRef.current) return

    const date = hoverIndex.dates[index]
    const point = hoverIndex.pointsByDate.get(date)?.[0]?.point

    if (!point) return

    const rect = svgRef.current.getBoundingClientRect()
    setKeyboardIndex(index)
    setHover({
      x: point.x,
      cursorX: rect.left + (point.x / chartWidth) * rect.width,
      cursorY: rect.top + rect.height / 2,
      timestamp: Date.parse(point.date),
      pointDate: point.date,
    })
  }

  const queueHover = (clientX: number, clientY: number) => {
    pointer.current = { x: clientX, y: clientY }

    if (pointerFrame.current !== null) return

    pointerFrame.current = requestAnimationFrame(() => {
      pointerFrame.current = null

      const cursor = pointer.current
      const svg = svgRef.current

      if (!cursor || !svg || !model || !hoverIndex) return

      setHover(
        hoverAt(cursor, svg.getBoundingClientRect(), {
          model,
          points: hoverIndex.points,
        }),
      )
    })
  }

  if (!mounted) {
    return (
      <div className="trends-chart trends-chart--empty">Preparing chart…</div>
    )
  }

  const tooltipRows =
    hover && hoverIndex
      ? hoverIndex.tooltipSeries.map(row => ({
          name: row.name,
          color: row.color,
          point:
            row.points[nearestTimestamp(row.points, hover.timestamp)]?.point,
        }))
      : []

  const tooltipAnnotations =
    hover && model
      ? model.releaseLines.filter(
          annotation =>
            Math.abs(Date.parse(annotation.date) - hover.timestamp) <=
            Math.max((model.maxTime - model.minTime) / 80, 24 * 60 * 60 * 1000),
        )
      : []

  return (
    <div className="trends-chart">
      <div className="trends-chart__layout">
        {actions && <div className="trends-chart__actions">{actions}</div>}
        <div className="trends-chart__plot">
          <div className="trends-chart__series" ref={chartSeriesRef}>
            {!model && !pending && !showLoader && (
              <div className="trends-chart__no-data" role="status">
                <strong>No {metric} data points are available.</strong>
                <span>Try another metric or time range.</span>
              </div>
            )}
            {model && (
              <svg
                ref={svgRef}
                className="trends-chart__svg"
                viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
                role="group"
                aria-label={`${metric} trends chart`}
                onMouseLeave={() => {
                  pointer.current = null
                  setHover(null)
                }}
                onMouseMove={event => queueHover(event.clientX, event.clientY)}
                onPointerUp={event => {
                  if (event.pointerType === 'touch')
                    queueHover(event.clientX, event.clientY)
                }}
              >
                <TrendsPlot
                  model={model}
                  metric={metric}
                  range={range}
                  groupBy={groupBy}
                />
                {hover?.pointDate &&
                  hoverIndex?.pointsByDate
                    .get(hover.pointDate)
                    ?.map(({ point, color, seriesIndex }) => (
                      <circle
                        key={`${seriesIndex}-${point.date}-${point.version ?? ''}`}
                        className="trends-chart__series-dot-magnet"
                        clipPath={`url(#trends-series-clip-${seriesIndex})`}
                        cx={point.x}
                        cy={point.y}
                        r="6"
                        stroke={color}
                        fill={
                          point.placeholder ? 'var(--color-text-muted)' : 'none'
                        }
                      />
                    ))}
                {hover && (
                  <line
                    className="trends-chart__hover-line"
                    x1={hover.x}
                    x2={hover.x}
                    y1={PLOT.top}
                    y2={PLOT.top + model.plotHeight}
                  />
                )}
              </svg>
            )}
          </div>
          {keyboardDate && hoverIndex && (
            <label className="trends-chart__explorer">
              Explore chart dates
              <input
                type="range"
                min={0}
                max={hoverIndex.dates.length - 1}
                value={keyboardPointIndex}
                aria-valuetext={keyboardValue}
                onFocus={event =>
                  exploreDate(event.currentTarget.valueAsNumber)
                }
                onChange={event =>
                  exploreDate(event.currentTarget.valueAsNumber)
                }
                onBlur={() => setHover(null)}
              />
            </label>
          )}
          {hover && tooltipRows.length > 0 && (
            <div ref={tooltipRef} className="trends-chart__tooltip">
              <div className="trends-chart__tooltip-date">
                {new Date(hover.timestamp).toISOString().slice(0, 10)}
              </div>
              <div className="trends-chart__tooltip-items">
                {tooltipRows.map(
                  row =>
                    row.point && (
                      <div key={row.name} className="trends-chart__tooltip-row">
                        <span
                          className="trends-chart__swatch"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="trends-chart__tooltip-name">
                          {row.name}
                          {row.point.version ? ` v${row.point.version}` : ''}
                          {row.point.placeholder
                            ? ' (size unavailable)'
                            : row.point.partial
                              ? ' (in progress)'
                              : ''}
                        </span>
                        {row.point.placeholder ? (
                          <span className="trends-chart__tooltip-unit">—</span>
                        ) : (
                          <span className="trends-chart__tooltip-value">
                            <span>
                              {formatMetricValue(row.point.value, metric).value}
                            </span>
                            {formatMetricValue(row.point.value, metric)
                              .unit && (
                              <span className="trends-chart__tooltip-unit">
                                {' '}
                                {
                                  formatMetricValue(row.point.value, metric)
                                    .unit
                                }
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    ),
                )}
              </div>
              {tooltipAnnotations.length > 0 && (
                <div className="trends-chart__tooltip-markers">
                  {tooltipAnnotations.map(annotation => (
                    <div
                      key={`${annotation.date}-${annotation.label}`}
                      className="trends-chart__tooltip-marker"
                    >
                      <span className="trends-chart__tooltip-marker-kind">
                        Release
                      </span>
                      {annotation.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {showLoader && (
            <div
              className="trends-chart__loader"
              aria-label="Loading chart data"
              ref={loaderRef}
            >
              <TrendsLoader />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
