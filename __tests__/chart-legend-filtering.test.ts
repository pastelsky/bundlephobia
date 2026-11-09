import { resolveSeriesColor, PALETTE_COLORS } from '../stats-app/src/lib/colors'
import { toggleSeries } from '../stats-app/src/components/ui/ChartLegend'

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

describe('chart legend series filtering and multi-select', () => {
  const total = 4

  it('filters to just the clicked label on regular click when all series are visible', () => {
    const initial = new Set<string>()
    const next = toggleSeries(initial, '2xx', { isShift: false, total })

    expect([...next]).toEqual(['2xx'])
  })

  it('resets to showing all series when clicking the only currently active label again', () => {
    const active = new Set(['2xx'])
    const next = toggleSeries(active, '2xx', { isShift: false, total })

    expect(next.size).toBe(0)
  })

  it('switches filter to just the newly clicked label on regular click', () => {
    const active = new Set(['2xx', '3xx'])
    const next = toggleSeries(active, '4xx', { isShift: false, total })

    expect([...next]).toEqual(['4xx'])
  })

  it('starts multi-selection with the clicked label on Shift-click when no filter is active', () => {
    const initial = new Set<string>()
    const next = toggleSeries(initial, '3xx', { isShift: true, total })

    expect([...next]).toEqual(['3xx'])
  })

  it('adds more series on Shift-click', () => {
    const active = new Set(['2xx'])
    const next = toggleSeries(active, '5xx', { isShift: true, total })

    expect([...next].sort()).toEqual(['2xx', '5xx'])
  })

  it('removes a series on Shift-click if it was already selected', () => {
    const active = new Set(['2xx', '5xx'])
    const next = toggleSeries(active, '5xx', { isShift: true, total })

    expect([...next]).toEqual(['2xx'])
  })

  it('resets to showing all series if removing the last selected series via Shift-click', () => {
    const active = new Set(['2xx'])
    const next = toggleSeries(active, '2xx', { isShift: true, total })

    expect(next.size).toBe(0)
  })

  it('resets to showing all series if Shift-selecting every available series', () => {
    const active = new Set(['2xx', '3xx', '4xx'])
    const next = toggleSeries(active, '5xx', { isShift: true, total })

    expect(next.size).toBe(0)
  })
})
