import { useMemo } from 'react'
import { SeriesTooltip } from './SeriesTooltip'
import {
  AreaChart,
  LineChart,
  type LineChartProps,
  type CustomTooltipProps,
} from '@tremor/react'

export type TimeSeriesChartProps = LineChartProps & {
  variant?: 'area' | 'line'
  stacked?: boolean
  showShare?: boolean
}

export interface ChartBindingContext {
  categories: string[]
  colors: string[]
  tooltip: (props: CustomTooltipProps) => React.JSX.Element | null
  formatter: (value: number) => string
}

function ChartCanvas({
  variant,
  stacked,
  chartProps,
}: {
  variant?: 'area' | 'line'
  stacked?: boolean
  chartProps: LineChartProps
}) {
  if (variant === 'line') return <LineChart {...chartProps} />

  return (
    <AreaChart
      {...chartProps}
      stack={stacked ?? false}
      showGradient={!stacked}
    />
  )
}

export function buildChartProps(
  options: TimeSeriesChartProps,
  context: ChartBindingContext,
): LineChartProps {
  const {
    variant: _variant,
    stacked: _stacked,
    showShare: _showShare,
    showLegend: _showLegend,
    minValue,
    autoMinValue,
    onValueChange,
    ...props
  } = options

  return {
    className: 'h-[205px] wide:h-[280px] mobile:h-60',
    connectNulls: false,
    curveType: 'linear',
    showAnimation: false,
    enableLegendSlider: true,
    startEndOnly: true,
    autoMinValue,
    minValue: autoMinValue ? undefined : (minValue ?? 0),
    yAxisWidth: 60,
    ...props,
    valueFormatter: context.formatter,
    customTooltip: context.tooltip,
    showLegend: options.showLegend ?? context.categories.length > 1,
    categories: context.categories,
    colors: context.colors,
    onValueChange: onValueChange ?? (() => {}),
  }
}

export function TimeSeriesChart(options: TimeSeriesChartProps) {
  const { variant, stacked, showShare, categories = [], colors = [] } = options
  const formatter = options.valueFormatter ?? String

  const tooltip = useMemo(
    () => (tooltipProps: CustomTooltipProps) => (
      <SeriesTooltip
        {...tooltipProps}
        format={formatter}
        showShare={showShare}
      />
    ),
    [formatter, showShare],
  )

  const chartProps = buildChartProps(options, {
    categories,
    colors,
    tooltip,
    formatter,
  })

  return (
    <div className={options.className ?? 'mt-6 mobile:mt-[18px]'}>
      <ChartCanvas
        variant={variant}
        stacked={stacked}
        chartProps={chartProps}
      />
    </div>
  )
}
