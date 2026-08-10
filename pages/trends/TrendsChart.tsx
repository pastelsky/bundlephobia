import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import anime from 'animejs'
import { bisector } from 'd3-array'
import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  type VirtualElement,
} from '@floating-ui/dom'

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
      timestamp
    )
  ]
}

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
  const [showLoader, setShowLoader] = useState(loading)
  const [hover, setHover] = useState<{
    x: number
    y: number
    timestamp: number
    pointKey?: string
  } | null>(null)
  const chartSeriesRef = useRef<HTMLDivElement>(null)
  const loaderRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(INITIAL_CHART_WIDTH)

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
  }, [])

  useIsomorphicLayoutEffect(() => {
    if (loading) {
      setShowLoader(true)
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
  }, [loading])

  React.useEffect(() => setMounted(true), [])

  const model = useMemo(
    () =>
      buildChartModel({
        packages,
        metric,
        groupBy,
        showMajorReleases,
        showMinorReleases,
        chartWidth,
      }),
    [
      packages,
      metric,
      groupBy,
      showMajorReleases,
      showMinorReleases,
      chartWidth,
    ]
  )

  const animationKey = `${metric}:${range}:${groupBy}:${packages
    .map(pack => pack.name)
    .join(',')}:${model?.series.map(series => series.points.length).join(',')}`
  const plotWidth = model?.plotWidth

  useIsomorphicLayoutEffect(() => {
    if (!plotWidth || loading || !chartSeriesRef.current) return
    const root = chartSeriesRef.current
    const clips = Array.from(
      root.querySelectorAll<SVGRectElement>('[data-series-clip]')
    )
    const dots = Array.from(
      root.querySelectorAll<SVGCircleElement>('[data-series-dot]')
    )
    const animations = [
      anime({
        targets: clips,
        width: [0, plotWidth],
        duration: DRAW_DURATION,
        easing: CHART_EASING,
      }),
      anime({
        targets: dots,
        r: [0, 4.15, 2.65],
        opacity: [0, 1],
        duration: 260,
        easing: CHART_EASING,
        delay: dot =>
          Number((dot as unknown as SVGCircleElement).dataset.delay || 0),
      }),
    ]
    return () => animations.forEach(animation => animation.pause())
  }, [animationKey, loading, plotWidth])

  useIsomorphicLayoutEffect(() => {
    const tooltip = tooltipRef.current
    const svg = svgRef.current
    if (!hover || !tooltip || !svg) return

    const reference: VirtualElement = {
      getBoundingClientRect: () => {
        const rect = svg.getBoundingClientRect()
        const x = rect.left + (hover.x / chartWidth) * rect.width
        const y = rect.top + (hover.y / CHART_HEIGHT) * rect.height
        return new DOMRect(x, y, 0, 0)
      },
    }
    const update = () => {
      computePosition(reference, tooltip, {
        strategy: 'fixed',
        placement: hover.x / chartWidth > 0.7 ? 'left-start' : 'right-start',
        middleware: [offset(12), flip(), shift({ padding: 8 })],
      }).then(({ x, y, strategy }) => {
        Object.assign(tooltip.style, {
          position: strategy,
          left: `${x}px`,
          top: `${y}px`,
        })
      })
    }

    update()
    return autoUpdate(svg, tooltip, update)
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
          point: nearestPoint(seriesForMetric(pack, metric), hover.timestamp),
        }))
      : []
  const tooltipAnnotations =
    hover && model
      ? model.releaseLines.filter(
          annotation =>
            Math.abs(Date.parse(annotation.date) - hover.timestamp) <=
            Math.max((model.maxTime - model.minTime) / 80, 24 * 60 * 60 * 1000)
        )
      : []

  return (
    <div className="trends-chart">
      <div className="trends-chart__layout">
        {actions && <div className="trends-chart__actions">{actions}</div>}
        <div className="trends-chart__plot">
          <div className="trends-chart__series" ref={chartSeriesRef}>
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
                    Math.min(PLOT.left + model.plotWidth, relativeX)
                  )
                  const nearestAnnotation = model.releaseLines.reduce<
                    (typeof model.releaseLines)[number] | null
                  >(
                    (nearest, annotation) =>
                      !nearest ||
                      Math.abs(annotation.x - clampedX) <
                        Math.abs(nearest.x - clampedX)
                        ? annotation
                        : nearest,
                    null
                  )
                  const snappedAnnotation =
                    nearestAnnotation &&
                    Math.abs(nearestAnnotation.x - clampedX) <= 12
                      ? nearestAnnotation
                      : null
                  const nearestPoint = model.series
                    .flatMap(series =>
                      [...series.markers, ...series.partialMarkers].map(
                        point => ({ point, seriesName: series.name })
                      )
                    )
                    .reduce<
                      | {
                          point: { x: number; y: number; date: string }
                          seriesName: string
                        }
                      | undefined
                    >((nearest, candidate) => {
                      const candidateDistance = Math.hypot(
                        candidate.point.x - clampedX,
                        candidate.point.y - relativeY
                      )
                      const nearestDistance = nearest
                        ? Math.hypot(
                            nearest.point.x - clampedX,
                            nearest.point.y - relativeY
                          )
                        : Number.POSITIVE_INFINITY
                      return candidateDistance < nearestDistance
                        ? candidate
                        : nearest
                    }, undefined)
                  const magneticPoint =
                    nearestPoint &&
                    Math.hypot(
                      nearestPoint.point.x - clampedX,
                      nearestPoint.point.y - relativeY
                    ) <= 28
                      ? nearestPoint
                      : null
                  const hoverX =
                    magneticPoint?.point.x ?? snappedAnnotation?.x ?? clampedX
                  const timestamp = magneticPoint
                    ? Date.parse(magneticPoint.point.date)
                    : snappedAnnotation
                    ? Date.parse(snappedAnnotation.date)
                    : model.minTime +
                      ((hoverX - PLOT.left) / model.plotWidth) *
                        (model.maxTime - model.minTime)
                  setHover({
                    x: hoverX,
                    y:
                      magneticPoint?.point.y ??
                      Math.max(
                        PLOT.top + 36,
                        Math.min(CHART_HEIGHT - 42, relativeY)
                      ),
                    timestamp,
                    pointKey: magneticPoint
                      ? `${magneticPoint.seriesName}-${magneticPoint.point.date}`
                      : undefined,
                  })
                }}
              >
                <defs>
                  {model.series.map((series, index) => (
                    <clipPath
                      key={series.name}
                      id={`trends-series-clip-${index}`}
                    >
                      <rect
                        data-series-clip
                        x={PLOT.left}
                        y={PLOT.top}
                        width="0"
                        height={model.plotHeight}
                      />
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
                      x1={model.xFor(tick.toISOString().slice(0, 10))}
                      x2={model.xFor(tick.toISOString().slice(0, 10))}
                      y1={PLOT.top + model.plotHeight}
                      y2={PLOT.top + model.plotHeight + 4}
                    />
                    <text
                      className="trends-chart__axis-label"
                      x={model.xFor(tick.toISOString().slice(0, 10))}
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
                    key={series.name}
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
                        data-delay={Math.round(
                          ((point.x - PLOT.left) / model.plotWidth) *
                            DRAW_DURATION
                        )}
                        className="trends-chart__series-dot"
                        cx={point.x}
                        cy={point.y}
                        r="0"
                        fill={series.color}
                        opacity="0"
                      />
                    ))}
                    {series.partialMarkers.map(point => (
                      <circle
                        key={`${series.name}-${point.date}-partial`}
                        data-series-dot
                        data-delay={DRAW_DURATION}
                        className="trends-chart__series-dot trends-chart__series-dot--partial"
                        cx={point.x}
                        cy={point.y}
                        r="0"
                        fill={series.color}
                        opacity="0"
                      />
                    ))}
                    {[...series.markers, ...series.partialMarkers]
                      .filter(
                        point =>
                          hover?.pointKey === `${series.name}-${point.date}`
                      )
                      .map(point => (
                        <circle
                          key={`${series.name}-${point.date}-magnet`}
                          className="trends-chart__series-dot-magnet"
                          cx={point.x}
                          cy={point.y}
                          r="6"
                          stroke={series.color}
                        />
                      ))}
                  </g>
                ))}
                {model.seriesAnnotations.map(annotation => (
                  <g
                    key={`${annotation.name}-annotation`}
                    className="trends-chart__series-annotation"
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
                          {row.point.partial ? ' (in progress)' : ''}
                        </span>
                        <span className="trends-chart__tooltip-value">
                          <span>
                            {formatMetricValue(row.point.value, metric).value}
                          </span>
                          {formatMetricValue(row.point.value, metric).unit && (
                            <span className="trends-chart__tooltip-unit">
                              {' '}
                              {formatMetricValue(row.point.value, metric).unit}
                            </span>
                          )}
                        </span>
                      </div>
                    )
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
