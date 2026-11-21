import { useMemo, useState } from 'react'
import { SeriesTooltip } from './SeriesTooltip'
import { resolveSeriesColor } from '../../lib/colors'
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
    enableLegendSlider: false,
    startEndOnly: true,
    autoMinValue,
    minValue: autoMinValue ? undefined : (minValue ?? 0),
    yAxisWidth: 60,
    ...props,
    valueFormatter: context.formatter,
    customTooltip: context.tooltip,
    showLegend: false,
    categories: context.categories,
    colors: context.colors,
    onValueChange,
  }
}

function ChartLegend({
  categories,
  colors,
  selected,
  onToggle,
}: {
  categories: string[]
  colors: string[]
  selected: string | null
  onToggle(name: string): void
}) {
  const items = Array.from(
    new Map(
      categories.map((name, index) => [name, colors[index] ?? 'slate']),
    ).entries(),
  )

  return (
    <ul
      className="mb-2.5 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] text-stats-muted"
      aria-label="Chart legend"
    >
      {items.map(([name, color]) => {
        const dimmed = selected !== null && selected !== name

        return (
          <li key={name}>
            <button
              type="button"
              onClick={() => onToggle(name)}
              aria-pressed={selected === name}
              className={`inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-opacity hover:text-stats-text ${dimmed ? 'opacity-40' : ''}`}
            >
              <span
                className="size-2 flex-none rounded-full"
                style={{ backgroundColor: resolveSeriesColor(color) }}
              />
              <span>{name}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function resolveVisibleSeries(
  categories: string[],
  colors: string[],
  selected: string | null,
) {
  if (!selected) return { activeSelected: null, categories, colors }

  const index = categories.indexOf(selected)

  if (index === -1) return { activeSelected: null, categories, colors }

  return {
    activeSelected: selected,
    categories: [selected],
    colors: [colors[index] ?? 'slate'],
  }
}

export function TimeSeriesChart(options: TimeSeriesChartProps) {
  const { variant, stacked, showShare, categories = [], colors = [] } = options
  const [selected, setSelected] = useState<string | null>(null)
  const formatter = options.valueFormatter ?? String
  const displayLegend = options.showLegend ?? categories.length > 1
  const visible = resolveVisibleSeries(categories, colors, selected)

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
    categories: visible.categories,
    colors: visible.colors,
    tooltip,
    formatter,
  })

  return (
    <div className={options.className ?? 'mt-5 mobile:mt-4'}>
      {displayLegend && categories.length > 0 && (
        <ChartLegend
          categories={categories}
          colors={colors}
          selected={visible.activeSelected}
          onToggle={name =>
            setSelected(current => (current === name ? null : name))
          }
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
