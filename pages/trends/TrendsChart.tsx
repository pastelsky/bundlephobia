import React, { useMemo } from 'react'

import type {
  TrendsMetric,
  TrendsPackageSeries,
} from '@bundlephobia/service-contracts/trends'

export const TRENDS_SERIES_COLORS = [
  '#6c5ce7',
  '#e76f51',
  '#2a9d8f',
  '#e9c46a',
  '#457b9d',
]

const WIDTH = 960

const HEIGHT = 360

const PADDING = { top: 24, right: 24, bottom: 44, left: 64 }

function formatValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`

  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`

  return Math.round(value).toLocaleString()
}

function linePath(points: { x: number; y: number }[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
}

function metricPoints(series: TrendsPackageSeries, metric: TrendsMetric) {
  return series[metric]
}

export default function TrendsChart({
  packages,
  metric,
}: {
  packages: TrendsPackageSeries[]
  metric: TrendsMetric
}) {
  const model = useMemo(() => {
    const points = packages.flatMap(series => metricPoints(series, metric))
    const dates = points.map(point => point.date).sort()
    const minDate = dates[0] ? new Date(`${dates[0]}T00:00:00Z`).getTime() : 0

    const maxDate = dates.at(-1)
      ? new Date(`${dates.at(-1)}T00:00:00Z`).getTime()
      : 1

    const maxValue = Math.max(...points.map(point => point.value), 1)
    const innerWidth = WIDTH - PADDING.left - PADDING.right
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom

    const x = (date: string) => {
      const time = new Date(`${date}T00:00:00Z`).getTime()

      return (
        PADDING.left +
        ((time - minDate) / Math.max(maxDate - minDate, 1)) * innerWidth
      )
    }

    const y = (value: number) =>
      PADDING.top + innerHeight - (value / maxValue) * innerHeight

    return {
      maxValue,
      x,
      y,
      innerHeight,
      series: packages.map(series => ({
        ...series,
        points: metricPoints(series, metric).map(point => ({
          ...point,
          x: x(point.date),
          y: y(point.value),
        })),
      })),
    }
  }, [metric, packages])

  if (!packages.length || !packages.some(series => series[metric].length)) {
    return (
      <div className="trends-chart__empty">
        No history is available for this selection.
      </div>
    )
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="trends-chart" aria-label={`${metric} history chart`}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
        {gridLines.map(fraction => {
          const value = model.maxValue * fraction
          const y = PADDING.top + model.innerHeight * (1 - fraction)

          return (
            <g key={fraction} className="trends-chart__grid-line">
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={y}
                y2={y}
              />
              <text x={PADDING.left - 12} y={y + 4} textAnchor="end">
                {formatValue(value)}
              </text>
            </g>
          )
        })}
        {model.series.map((series, index) => (
          <g key={series.name} className="trends-chart__series">
            <path
              d={linePath(series.points)}
              stroke={TRENDS_SERIES_COLORS[index % TRENDS_SERIES_COLORS.length]}
              fill="none"
            />
            {series.points.map(point => (
              <circle
                key={`${series.name}-${point.date}`}
                cx={point.x}
                cy={point.y}
                r="3"
                fill={TRENDS_SERIES_COLORS[index % TRENDS_SERIES_COLORS.length]}
              >
                <title>{`${series.name} · ${point.date}: ${formatValue(point.value)}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <div className="trends-chart__legend">
        {packages.map((series, index) => (
          <span key={series.name}>
            <i
              style={{
                backgroundColor:
                  TRENDS_SERIES_COLORS[index % TRENDS_SERIES_COLORS.length],
              }}
            />
            {series.name}
          </span>
        ))}
      </div>
    </div>
  )
}
