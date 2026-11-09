import { useCallback, useEffect, useMemo, useState } from 'react'
import { SeriesTooltip } from './SeriesTooltip'
import { ChartLegend, toggleSeries } from './ChartLegend'
import {
  AreaChart,
  LineChart,
  type LineChartProps,
  type CustomTooltipProps,
} from '@tremor/react'

function sanitizeSelection(
  prev: Set<string>,
  categories: string[],
): Set<string> {
  if (prev.size === 0) return prev

  const valid = new Set([...prev].filter(cat => categories.includes(cat)))

  if (valid.size === 0 || valid.size === categories.length) return new Set()

  if (valid.size === prev.size) return prev

  return valid
}

function useSeriesFilter(categories: string[], colors: (string | undefined)[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  const colorMap = useMemo(() => {
    const map = new Map<string, string>()

    categories.forEach((cat, index) => {
      map.set(cat, colors[index % (colors.length || 1)] ?? 'gray')
    })

    return map
  }, [categories, colors])

  useEffect(() => {
    setSelected(prev => sanitizeSelection(prev, categories))
  }, [categories])

  const toggle = useCallback(
    (category: string, isShift: boolean) => {
      setSelected(prev =>
        toggleSeries(prev, category, { isShift, total: categories.length }),
      )
    },
    [categories.length],
  )

  const isFiltered = selected.size > 0 && selected.size < categories.length

  const visible = useMemo(
    () => (isFiltered ? categories.filter(c => selected.has(c)) : categories),
    [categories, isFiltered, selected],
  )

  const visibleColors = useMemo(
    () => visible.map(c => colorMap.get(c) ?? 'gray'),
    [visible, colorMap],
  )

  return { selected, colorMap, toggle, visible, visibleColors }
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

export function buildChartProps(
  options: TimeSeriesChartProps,
  context: ChartBindingContext,
): LineChartProps {
  const {
    variant: _variant,
    stacked: _stacked,
    showShare: _showShare,
    showLegend: _showLegend,
    ...props
  } = options

  return {
    ...props,
    className: 'h-[205px] wide:h-[280px] mobile:h-60',
    connectNulls: false,
    curveType: 'linear',
    showAnimation: false,
    enableLegendSlider: true,
    startEndOnly: true,
    minValue: 0,
    yAxisWidth: 60,
    valueFormatter: context.formatter,
    customTooltip: context.tooltip,
    showLegend: false,
    categories: context.categories,
    colors: context.colors,
  }
}

function chartConfig(options: TimeSeriesChartProps) {
  const categories = options.categories ?? []
  const colors = options.colors ?? []
  const formatter = options.valueFormatter ?? String
  const showLegend = options.showLegend ?? true

  return {
    categories,
    colors,
    formatter,
    hasLegend: showLegend && categories.length > 1,
    wrapperClass: options.className ?? 'mt-6 mobile:mt-[18px]',
  }
}

export function TimeSeriesChart(options: TimeSeriesChartProps) {
  const { variant, stacked, showShare } = options
  const config = chartConfig(options)
  const filter = useSeriesFilter(config.categories, config.colors)

  const tooltip = useMemo(
    () => (tooltipProps: CustomTooltipProps) => (
      <SeriesTooltip
        {...tooltipProps}
        format={config.formatter}
        showShare={showShare}
      />
    ),
    [config.formatter, showShare],
  )

  const chartProps = buildChartProps(options, {
    categories: filter.visible,
    colors: filter.visibleColors,
    tooltip,
    formatter: config.formatter,
  })

  return (
    <div className={config.wrapperClass}>
      {config.hasLegend && (
        <ChartLegend
          categories={config.categories}
          colorMap={filter.colorMap}
          selectedSeries={filter.selected}
          onToggleSeries={filter.toggle}
        />
      )}
      <ChartCanvas
        variant={variant}
        stacked={stacked}
        chartProps={chartProps}
      />
    </div>
  )
}
