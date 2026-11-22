import { useLayoutEffect, useRef } from 'react'
import type { TrendsMetric } from '../../client/api'
import {
  type Hover,
  type HoverIndex,
  nearestTimestamp,
} from './trendsChartInteraction'
import { type buildChartModel, formatMetricValue } from './trendsChartModel'

type TrendsChartTooltipProps = {
  hover: Hover
  index: HoverIndex
  model: NonNullable<ReturnType<typeof buildChartModel>>
  metric: TrendsMetric
}

export default function TrendsChartTooltip({
  hover,
  index,
  model,
  metric,
}: TrendsChartTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current

    if (!tooltip) return

    const gap = 14
    const maxLeft = window.innerWidth - tooltip.offsetWidth - 8
    const left = Math.max(8, Math.min(hover.cursorX + gap, maxLeft))
    const below = hover.cursorY + gap

    const top =
      below + tooltip.offsetHeight <= window.innerHeight - 8
        ? below
        : Math.max(8, hover.cursorY - tooltip.offsetHeight - gap)

    tooltip.style.transform = `translate3d(${left}px, ${top}px, 0)`
  }, [hover])

  const tooltipAnnotations = model.releaseLines.filter(
    annotation =>
      Math.abs(Date.parse(annotation.date) - hover.timestamp) <=
      Math.max((model.maxTime - model.minTime) / 80, 24 * 60 * 60 * 1000),
  )

  return (
    <div ref={tooltipRef} className="trends-chart__tooltip">
      <div className="trends-chart__tooltip-date">
        {new Date(hover.timestamp).toISOString().slice(0, 10)}
      </div>
      <div className="trends-chart__tooltip-items">
        {index.tooltipSeries.map(row => {
          const point =
            row.points[nearestTimestamp(row.points, hover.timestamp)]?.point

          if (!point) return null

          const { value, unit } = formatMetricValue(point.value, metric)

          return (
            <div key={row.name} className="trends-chart__tooltip-row">
              <span
                className="trends-chart__swatch"
                style={{ backgroundColor: row.color }}
              />
              <span className="trends-chart__tooltip-name">
                {row.name}
                {point.version ? ` v${point.version}` : ''}
                {point.placeholder
                  ? ' (size unavailable)'
                  : point.partial
                    ? ' (in progress)'
                    : ''}
              </span>
              {point.placeholder ? (
                <span className="trends-chart__tooltip-unit">—</span>
              ) : (
                <span className="trends-chart__tooltip-value">
                  <span>{value}</span>
                  {unit && (
                    <span className="trends-chart__tooltip-unit"> {unit}</span>
                  )}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {tooltipAnnotations.length > 0 && (
        <div className="trends-chart__tooltip-markers">
          {tooltipAnnotations.map(annotation => (
            <div
              key={`${annotation.date}-${annotation.label}`}
              className="trends-chart__tooltip-marker"
            >
              <span className="trends-chart__tooltip-marker-kind">Release</span>
              {annotation.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
