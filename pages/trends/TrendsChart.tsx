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
  INITIAL_CHART_WIDTH,
  PLOT,
  TRENDS_SERIES_COLORS,
  annotationPath,
  buildChartModel,
  formatDateTick,
  formatMetricValue,
  pathFor,
  seriesForMetric,
} from './trendsChartModel'

export { TRENDS_SERIES_COLORS } from './trendsChartModel'

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : useLayoutEffect

const DRAW_DURATION = 760

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
}

function nearestPoint(points: TrendsPoint[], timestamp: number) {
  if (points.length === 0) return null

  return points[
    bisector<TrendsPoint, number>(point => Date.parse(point.date)).center(
      points,
      timestamp,
    )
  ]
}

function nearestByX<T extends { x: number }>(points: T[], x: number) {
  return points.reduce<T | undefined>((nearest, candidate) => {
    if (!nearest) return candidate

    return Math.abs(candidate.x - x) < Math.abs(nearest.x - x)
      ? candidate
      : nearest
  }, undefined)
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
}: TrendsChartProps) {
  const [mounted, setMounted] = useState(false)
  const [showLoader, setShowLoader] = useState(loading && packages.length === 0)

  const [hover, setHover] = useState<{
    x: number
    cursorX: number
    cursorY: number
    timestamp: number
    pointDate?: string
  } | null>(null)

  const chartSeriesRef = useRef<HTMLDivElement>(null)
  const loaderRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(INITIAL_CHART_WIDTH)

  const incrementalLoading = loading && packages.length > 0

  useIsomorphicLayoutEffect(() => {
    const chart = chartSeriesRef.current

    if (!chart) return

    const updateChartWidth = () => {
      const nextWidth = Math.round(chart.getBoundingClientRect().width)

      if (nextWidth > 0)
        setChartWidth(current => (current === nextWidth ? current : nextWidth))
    }

    updateChartWidth()
    const observer = new ResizeObserver(updateChartWidth)
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

  useIsomorphicLayoutEffect(() => {
    const tooltip = tooltipRef.current
    const svg = svgRef.current

    if (!hover || !tooltip || !svg) return

    const update = () => {
      const rect = svg.getBoundingClientRect()
      const cursorX = rect.left + (hover.cursorX / chartWidth) * rect.width
      const cursorY = rect.top + (hover.cursorY / CHART_HEIGHT) * rect.height
      const gap = 14
      const maxLeft = window.innerWidth - tooltip.offsetWidth - 8
      const left = Math.max(8, Math.min(cursorX + gap, maxLeft))
      const below = cursorY + gap

      const top =
        below + tooltip.offsetHeight <= window.innerHeight - 8
          ? below
          : Math.max(8, cursorY - tooltip.offsetHeight - gap)

      Object.assign(tooltip.style, {
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
      })
    }

    update()
    window.addEventListener('resize', update)

    return () => window.removeEventListener('resize', update)
  }, [hover, chartWidth])

  if (!mounted) {
    return (
      <div className="trends-chart trends-chart--empty">Preparing chart…</div>
    )
  }

  const tooltipRows =
    hover && model
      ? packages.map((pack, index) => ({
          name: pack.name,
          color: TRENDS_SERIES_COLORS[index % TRENDS_SERIES_COLORS.length],
          point: nearestPoint(
            [
              ...seriesForMetric(pack, metric),
              ...(model.series[index]?.releaseMarkers || []),
            ],
            hover.timestamp,
          ),
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
            {!model && !showLoader && (
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
                role="img"
                aria-label={`${metric} trends chart`}
                onMouseLeave={() => setHover(null)}
                onMouseMove={event => {
                  const rect = event.currentTarget.getBoundingClientRect()

                  const relativeX =
                    ((event.clientX - rect.left) / rect.width) * chartWidth

                  const relativeY =
                    ((event.clientY - rect.top) / rect.height) * CHART_HEIGHT

                  const clampedX = Math.max(
                    PLOT.left,
                    Math.min(PLOT.left + model.plotWidth, relativeX),
                  )

                  const nearestPoint = nearestByX(
                    model.series.flatMap(series => [
                      ...series.points,
                      ...series.partialMarkers,
                      ...series.releaseMarkers,
                    ]),
                    clampedX,
                  )

                  const magneticPoint =
                    nearestPoint &&
                    Math.abs(nearestPoint.x - clampedX) <= DOT_MAGNET_RADIUS
                      ? nearestPoint
                      : null

                  const hoverX = magneticPoint?.x ?? clampedX

                  const timestamp = magneticPoint
                    ? Date.parse(magneticPoint.date)
                    : model.timestampForX(hoverX)

                  setHover({
                    x: hoverX,
                    cursorX: clampedX,
                    cursorY: relativeY,
                    timestamp,
                    pointDate: magneticPoint?.date,
                  })
                }}
              >
                <defs>
                  {model.series.map((series, index) => (
                    <clipPath
                      key={series.renderKey}
                      id={`trends-series-clip-${index}`}
                    >
                      <rect
                        data-series-clip
                        x={PLOT.left}
                        y={PLOT.top}
                        width={model.plotWidth}
                        height={model.plotHeight}
                      >
                        <animate
                          attributeName="width"
                          from="0"
                          to={model.plotWidth}
                          dur={`${DRAW_DURATION}ms`}
                          calcMode="spline"
                          keyTimes="0;1"
                          keySplines="0.215 0.61 0.355 1"
                          fill="freeze"
                        />
                      </rect>
                    </clipPath>
                  ))}
                </defs>
                {model.yTicks.map(value => {
                  const y = model.yFor(value)

                  return (
                    <g key={value}>
                      <line
                        className="trends-chart__grid"
                        x1={PLOT.left}
                        x2={PLOT.left + model.plotWidth}
                        y1={y}
                        y2={y}
                      />
                      <text
                        className="trends-chart__axis-label"
                        x={PLOT.left + 6}
                        y={y <= PLOT.top + 20 ? y + 13 : y - 7}
                        textAnchor="start"
                      >
                        <tspan>{formatMetricValue(value, metric).value}</tspan>
                        {formatMetricValue(value, metric).unit && (
                          <tspan className="trends-chart__axis-unit">
                            {formatMetricValue(value, metric).unit}
                          </tspan>
                        )}
                      </text>
                    </g>
                  )
                })}
                {model.xTicks.map((tick, index) => (
                  <g key={tick.toISOString()}>
                    <line
                      className="trends-chart__axis-tick"
                      x1={model.xForDate(tick)}
                      x2={model.xForDate(tick)}
                      y1={PLOT.top + model.plotHeight}
                      y2={PLOT.top + model.plotHeight + 6}
                    />
                    <text
                      className="trends-chart__axis-label trends-chart__axis-label--x"
                      x={model.xForDate(tick)}
                      y={CHART_HEIGHT - 10}
                      textAnchor={
                        index === 0
                          ? 'start'
                          : index === model.xTicks.length - 1
                            ? 'end'
                            : 'middle'
                      }
                    >
                      {formatDateTick(tick)}
                    </text>
                  </g>
                ))}
                <line
                  className="trends-chart__axis"
                  x1={PLOT.left}
                  x2={PLOT.left + model.plotWidth}
                  y1={PLOT.top + model.plotHeight}
                  y2={PLOT.top + model.plotHeight}
                />
                {model.releaseLines.map((release, index) => (
                  <line
                    key={`${release.date}-${release.version}-${index}`}
                    className={
                      release.major
                        ? 'trends-chart__overlay trends-chart__overlay--major'
                        : 'trends-chart__overlay trends-chart__overlay--minor'
                    }
                    x1={release.x}
                    x2={release.x}
                    y1={PLOT.top}
                    y2={PLOT.top + model.plotHeight}
                    stroke={release.color}
                  />
                ))}
                {model.series.map((series, index) => (
                  <g
                    key={series.renderKey}
                    clipPath={`url(#trends-series-clip-${index})`}
                  >
                    <path
                      className="trends-chart__line"
                      d={pathFor(series.points)}
                      stroke={series.color}
                    />
                    {series.partialPoints.length > 1 && (
                      <path
                        className="trends-chart__line trends-chart__line--partial"
                        d={pathFor(series.partialPoints)}
                        stroke={series.color}
                      />
                    )}
                    {series.markers.map(point => (
                      <circle
                        key={`${series.name}-${point.date}`}
                        data-series-dot
                        className="trends-chart__series-dot"
                        cx={point.x}
                        cy={point.y}
                        r="2.65"
                        fill={series.color}
                        opacity="1"
                      />
                    ))}
                    {series.partialMarkers.map(point => (
                      <circle
                        key={`${series.name}-${point.date}-partial`}
                        data-series-dot
                        className="trends-chart__series-dot trends-chart__series-dot--partial"
                        cx={point.x}
                        cy={point.y}
                        r="2.65"
                        fill={series.color}
                        opacity="1"
                      />
                    ))}
                    {[
                      ...series.points,
                      ...series.partialMarkers,
                      ...series.releaseMarkers,
                    ]
                      .filter(point => hover?.pointDate === point.date)
                      .map(point => (
                        <circle
                          key={`${series.name}-${point.date}-magnet`}
                          className="trends-chart__series-dot-magnet"
                          cx={point.x}
                          cy={point.y}
                          r="6"
                          stroke={series.color}
                          fill={
                            point.placeholder
                              ? 'var(--color-text-muted)'
                              : 'none'
                          }
                        />
                      ))}
                    {series.releaseMarkers.map(point => (
                      <circle
                        key={`${series.name}-${point.date}-${point.version}-release`}
                        data-series-dot
                        data-series-name={series.name}
                        className="trends-chart__series-dot trends-chart__series-dot--placeholder"
                        cx={point.x}
                        cy={point.y}
                        r="3"
                        fill="var(--color-text-muted)"
                        opacity="0.85"
                      />
                    ))}
                  </g>
                ))}
                {model.seriesAnnotations.map(annotation => (
                  <g
                    key={`${annotation.name}-${metric}-${range}-${groupBy}-annotation`}
                    className="trends-chart__series-annotation"
                  >
                    <a
                      href={`/package/${annotation.name}`}
                      className="trends-chart__series-annotation-link"
                    >
                      <path
                        d={annotationPath(annotation)}
                        stroke={annotation.color}
                      />
                      <text
                        x={annotation.labelX}
                        y={annotation.labelY}
                        textAnchor="start"
                        fill={annotation.color}
                      >
                        {annotation.name}
                      </text>
                    </a>
                  </g>
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
                          {(
                            row.point as TrendsPoint & { placeholder?: boolean }
                          ).placeholder
                            ? ' (size unavailable)'
                            : row.point.partial
                              ? ' (in progress)'
                              : ''}
                        </span>
                        {(row.point as TrendsPoint & { placeholder?: boolean })
                          .placeholder ? (
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
