import { useMemo } from 'react'
import { SeriesTooltip } from './SeriesTooltip'
import {
  AreaChart,
  LineChart,
  type LineChartProps,
  type CustomTooltipProps,
} from '@tremor/react'

export function TimeSeriesChart({
  variant = 'area',
  stacked = false,
  showShare = false,
  valueFormatter = String,
  ...props
}: LineChartProps & {
  variant?: 'area' | 'line'
  stacked?: boolean
  showShare?: boolean
}) {
  const tooltip = useMemo(
    () => (tooltipProps: CustomTooltipProps) => (
      <SeriesTooltip {...tooltipProps} format={valueFormatter} />
    ),
    [valueFormatter],
  )

  const chartProps: LineChartProps = {
    className: 'mt-6 h-[205px] wide:h-[280px] mobile:mt-[18px] mobile:h-60',
    connectNulls: false,
    curveType: 'linear',
    showAnimation: false,
    enableLegendSlider: true,
    startEndOnly: true,
    minValue: 0,
    yAxisWidth: 60,
    valueFormatter,
    customTooltip: showShare ? tooltip : undefined,
    ...props,
  }

  if (variant === 'line') return <LineChart {...chartProps} />

  return <AreaChart {...chartProps} stack={stacked} showGradient={!stacked} />
}
