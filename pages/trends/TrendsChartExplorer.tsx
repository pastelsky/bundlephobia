import { memo, useState } from 'react'
import type { TrendsMetric } from '../../client/api'
import { type HoverIndex, nearestTimestamp } from './trendsChartInteraction'
import { type ChartPoint, formatMetricValue } from './trendsChartModel'

type TrendsChartExplorerProps = {
  index: HoverIndex
  metric: TrendsMetric
  onExplore: (point: ChartPoint) => void
  onBlur: () => void
}

export default memo(function TrendsChartExplorer({
  index,
  metric,
  onExplore,
  onBlur,
}: TrendsChartExplorerProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const lastIndex = index.dates.length - 1
  const currentIndex = Math.min(selectedIndex ?? lastIndex, lastIndex)
  const date = index.dates[currentIndex]

  if (!date) return null

  const timestamp = Date.parse(date)

  const values = index.tooltipSeries.map(series => {
    const point =
      series.points[nearestTimestamp(series.points, timestamp)]?.point

    if (!point || point.placeholder) return `${series.name}: unavailable`

    const { value, unit } = formatMetricValue(point.value, metric)

    return `${series.name}: ${value}${unit}`
  })

  const selectDate = (event: React.SyntheticEvent<HTMLInputElement>) => {
    const indexNumber = event.currentTarget.valueAsNumber
    const point = index.pointsByDate.get(index.dates[indexNumber])?.[0]?.point

    if (!point) return

    setSelectedIndex(indexNumber)
    onExplore(point)
  }

  return (
    <label className="trends-chart__explorer">
      Explore chart dates
      <input
        type="range"
        min={0}
        max={lastIndex}
        value={currentIndex}
        aria-valuetext={[date, ...values].join(', ')}
        onFocus={selectDate}
        onChange={selectDate}
        onBlur={onBlur}
      />
    </label>
  )
})
