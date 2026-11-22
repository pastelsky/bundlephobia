/* eslint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-array-filter-map */

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import anime from 'animejs'

import type {
  TrendsGroupBy,
  TrendsMetric,
  TrendsPackageSeries,
  TrendsRange,
} from '../../client/api'
import TrendsLoader from './TrendsLoader'
import {
  CHART_HEIGHT,
  type ChartPoint,
  INITIAL_CHART_WIDTH,
  PLOT,
  buildChartModel,
} from './trendsChartModel'

import TrendsPlot from './TrendsPlot'
import TrendsChartExplorer from './TrendsChartExplorer'
import TrendsChartTooltip from './TrendsChartTooltip'
import { type Hover, buildHoverIndex, hoverAt } from './trendsChartInteraction'

export { TRENDS_SERIES_COLORS } from './trendsChartModel'

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : useLayoutEffect

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
  pending?: boolean
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
  const pointerFrame = useRef<number | null>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)

  const chartSeriesRef = useRef<HTMLDivElement>(null)
  const loaderRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
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

  const hoverIndex = useMemo(
    () => model && buildHoverIndex(model, packages, metric),
    [metric, model, packages],
  )

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

  const exploreDate = React.useCallback(
    (point: ChartPoint) => {
      const rect = svgRef.current?.getBoundingClientRect()

      if (!rect) return

      setHover({
        x: point.x,
        cursorX: rect.left + (point.x / chartWidth) * rect.width,
        cursorY: rect.top + rect.height / 2,
        timestamp: Date.parse(point.date),
        pointDate: point.date,
      })
    },
    [chartWidth],
  )

  const clearHover = React.useCallback(() => setHover(null), [])

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
          {hoverIndex && (
            <TrendsChartExplorer
              index={hoverIndex}
              metric={metric}
              onExplore={exploreDate}
              onBlur={clearHover}
            />
          )}
          {hover && hoverIndex && model && (
            <TrendsChartTooltip
              hover={hover}
              index={hoverIndex}
              model={model}
              metric={metric}
            />
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
