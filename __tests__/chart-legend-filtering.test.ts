import { resolveSeriesColor, PALETTE_COLORS } from '../stats-app/src/lib/colors'
import {
  buildChartProps,
  type ChartBindingContext,
} from '../stats-app/src/components/ui/TimeSeriesChart'

describe('series color resolution for hover tooltips', () => {
  it('resolves all Tremor named colors to exact Tailwind palette hex values', () => {
    expect(resolveSeriesColor('orange')).toBe(PALETTE_COLORS.orange)
    expect(resolveSeriesColor('rose')).toBe(PALETTE_COLORS.rose)
    expect(resolveSeriesColor('sky')).toBe(PALETTE_COLORS.sky)
    expect(resolveSeriesColor('emerald')).toBe(PALETTE_COLORS.emerald)
    expect(resolveSeriesColor('amber')).toBe(PALETTE_COLORS.amber)
    expect(resolveSeriesColor('violet')).toBe(PALETTE_COLORS.violet)
    expect(resolveSeriesColor('slate')).toBe(PALETTE_COLORS.slate)
    expect(resolveSeriesColor('stone')).toBe(PALETTE_COLORS.stone)
    expect(resolveSeriesColor('teal')).toBe(PALETTE_COLORS.teal)
    expect(resolveSeriesColor('indigo')).toBe(PALETTE_COLORS.indigo)
    expect(resolveSeriesColor('pink')).toBe(PALETTE_COLORS.pink)
    expect(resolveSeriesColor('lime')).toBe(PALETTE_COLORS.lime)
    expect(resolveSeriesColor('zinc')).toBe(PALETTE_COLORS.zinc)
  })

  it('handles case-insensitivity for color names', () => {
    expect(resolveSeriesColor('SKY')).toBe('#0ea5e9')
    expect(resolveSeriesColor('Emerald')).toBe('#10b981')
  })

  it('preserves raw hex codes and CSS colors as-is', () => {
    expect(resolveSeriesColor('#123456')).toBe('#123456')
    expect(resolveSeriesColor('rgb(10, 20, 30)')).toBe('rgb(10, 20, 30)')
  })

  it('falls back to default slate color when color is undefined or empty', () => {
    expect(resolveSeriesColor(undefined)).toBe('#64748b')
    expect(resolveSeriesColor('')).toBe('#64748b')
  })
})

describe('Tremor chart props construction and interactions', () => {
  const dummyContext: ChartBindingContext = {
    categories: ['2xx', '3xx', '4xx', '5xx'],
    colors: ['emerald', 'sky', 'amber', 'rose'],
    tooltip: () => null,
    formatter: String,
  }

  it('provides an onValueChange handler so Tremor enables interactive legend and series highlighting', () => {
    const props = buildChartProps(
      {
        data: [],
        index: 'time',
        categories: dummyContext.categories,
      },
      dummyContext,
    )

    expect(props.onValueChange).toBeInstanceOf(Function)
    expect(props.enableLegendSlider).toBe(true)
    expect(props.showLegend).toBe(true)
    expect(props.categories).toEqual(dummyContext.categories)
    expect(props.colors).toEqual(dummyContext.colors)
  })

  it('hides legend when single category is present unless explicitly requested', () => {
    const singleContext: ChartBindingContext = {
      ...dummyContext,
      categories: ['Requests'],
      colors: ['orange'],
    }

    const props = buildChartProps(
      {
        data: [],
        index: 'time',
        categories: singleContext.categories,
      },
      singleContext,
    )

    expect(props.showLegend).toBe(false)
  })

  it('respects explicit showLegend override', () => {
    const props = buildChartProps(
      {
        data: [],
        index: 'time',
        categories: dummyContext.categories,
        showLegend: false,
      },
      dummyContext,
    )

    expect(props.showLegend).toBe(false)
  })

  it('defaults minValue to 0 when not specified', () => {
    const props = buildChartProps(
      {
        data: [],
        index: 'time',
        categories: dummyContext.categories,
      },
      dummyContext,
    )

    expect(props.minValue).toBe(0)
    expect(props.autoMinValue).toBeUndefined()
  })

  it('respects explicit minValue and maxValue', () => {
    const props = buildChartProps(
      {
        data: [],
        index: 'time',
        categories: dummyContext.categories,
        minValue: 10,
        maxValue: 100,
      },
      dummyContext,
    )

    expect(props.minValue).toBe(10)
    expect(props.maxValue).toBe(100)
  })

  it('sets minValue to undefined when autoMinValue is true so Tremor computes automatic domain', () => {
    const props = buildChartProps(
      {
        data: [],
        index: 'time',
        categories: dummyContext.categories,
        autoMinValue: true,
      },
      dummyContext,
    )

    expect(props.minValue).toBeUndefined()
    expect(props.autoMinValue).toBe(true)
  })
})
