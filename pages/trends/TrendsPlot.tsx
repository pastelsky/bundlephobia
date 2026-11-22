import { memo } from 'react'

import type { TrendsGroupBy, TrendsMetric, TrendsRange } from '../../client/api'
import {
  CHART_HEIGHT,
  PLOT,
  annotationPath,
  type buildChartModel,
  formatDateTick,
  formatMetricValue,
  buildLinePath,
} from './trendsChartModel'

type TrendsPlotProps = {
  model: NonNullable<ReturnType<typeof buildChartModel>>
  metric: TrendsMetric
  range: TrendsRange
  groupBy: TrendsGroupBy
}

// Hover only redraws the cursor, highlighted dots and tooltip.
export default memo(function TrendsPlot({
  model,
  metric,
  range,
  groupBy,
}: TrendsPlotProps) {
  return (
    <>
      <defs>
        {model.series.map((series, index) => (
          <clipPath key={series.renderKey} id={`trends-series-clip-${index}`}>
            <rect
              data-series-clip
              className="trends-chart__series-clip"
              x={PLOT.left}
              y={PLOT.top}
              width={model.plotWidth}
              height={model.plotHeight}
            />
          </clipPath>
        ))}
      </defs>
      {model.yTicks.map(value => {
        const y = model.scaleValue(value)

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
              x={PLOT.left - 8}
              y={y + 3}
              textAnchor="end"
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
            x1={model.scaleDate(tick)}
            x2={model.scaleDate(tick)}
            y1={PLOT.top + model.plotHeight}
            y2={PLOT.top + model.plotHeight + 6}
          />
          <text
            className="trends-chart__axis-label trends-chart__axis-label--x"
            x={model.scaleDate(tick)}
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
          data-chart-series
          data-series-name={series.name}
          clipPath={`url(#trends-series-clip-${index})`}
        >
          <path
            className="trends-chart__line"
            d={buildLinePath(series.points)}
            stroke={series.color}
          />
          {series.partialPoints.length > 1 && (
            <path
              className="trends-chart__line trends-chart__line--partial"
              d={buildLinePath(series.partialPoints)}
              stroke={series.color}
            />
          )}
          {series.denseMarkerPath && (
            <path
              data-series-marker-path
              data-point-count={series.points.length}
              className="trends-chart__series-marker-path"
              d={series.denseMarkerPath}
              fill={series.color}
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
            aria-label={`${annotation.name} package details`}
            className="trends-chart__series-annotation-link"
          >
            <path d={annotationPath(annotation)} stroke={annotation.color} />
            <text
              x={annotation.labelX}
              y={annotation.labelY}
              textAnchor={annotation.textAnchor}
              fill={annotation.color}
            >
              {annotation.name}
            </text>
          </a>
        </g>
      ))}
    </>
  )
})
