import { AreaChart, LineChart, type LineChartProps } from '@tremor/react'

export function TimeSeriesChart({
  variant = 'area',
  stacked = false,
  ...props
}: LineChartProps & { variant?: 'area' | 'line'; stacked?: boolean }) {
  const chartProps: LineChartProps = {
    className: 'mt-6 h-[205px] wide:h-[280px] mobile:mt-[18px] mobile:h-60',
    connectNulls: false,
    curveType: 'linear',
    showAnimation: false,
    enableLegendSlider: true,
    startEndOnly: true,
    minValue: 0,
    yAxisWidth: 60,
    ...props,
  }

  if (variant === 'line') return <LineChart {...chartProps} />

  return <AreaChart {...chartProps} stack={stacked} showGradient={!stacked} />
}
