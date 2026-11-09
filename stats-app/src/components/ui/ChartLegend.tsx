import { resolveSeriesColor } from '../../lib/colors'

function toggleShift(
  prev: Set<string>,
  category: string,
  total: number,
): Set<string> {
  if (prev.size === 0 || prev.size >= total) {
    return new Set([category])
  }

  const next = new Set(prev)

  if (next.has(category)) {
    next.delete(category)

    if (next.size === 0) return new Set()
  } else {
    next.add(category)

    if (next.size === total) return new Set()
  }

  return next
}

export function toggleSeries(
  prev: Set<string>,
  category: string,
  options: { isShift: boolean; total: number },
): Set<string> {
  if (options.isShift) {
    return toggleShift(prev, category, options.total)
  }

  if (prev.size === 1 && prev.has(category)) {
    return new Set()
  }

  return new Set([category])
}

interface ChartLegendProps {
  categories: string[]
  colorMap: Map<string, string>
  selectedSeries: Set<string>
  onToggleSeries: (category: string, isShift: boolean) => void
}

export function ChartLegend({
  categories,
  colorMap,
  selectedSeries,
  onToggleSeries,
}: ChartLegendProps) {
  const isFiltered =
    selectedSeries.size > 0 && selectedSeries.size < categories.length

  return (
    <div className="mb-2 flex flex-wrap items-center justify-end">
      <ul className="flex flex-wrap items-center gap-1">
        {categories.map(category => {
          const color = colorMap.get(category) ?? 'gray'
          const isSelected = selectedSeries.has(category)
          const isDimmed = isFiltered && !isSelected

          return (
            <li key={category}>
              <button
                type="button"
                title={`Click to filter by ${category}, Shift-click to select multiple`}
                className={`group inline-flex cursor-pointer select-none items-center rounded-tremor-small px-2 py-0.5 text-tremor-content transition hover:bg-tremor-background-subtle dark:text-dark-tremor-content dark:hover:bg-dark-tremor-background-subtle ${
                  isDimmed ? 'opacity-40' : 'opacity-100'
                }`}
                onClick={e => {
                  e.stopPropagation()
                  onToggleSeries(category, e.shiftKey)
                }}
              >
                <span
                  className="mr-1.5 size-2 flex-none rounded-full"
                  style={{ backgroundColor: resolveSeriesColor(color) }}
                />
                <span className="truncate whitespace-nowrap text-tremor-default text-tremor-content group-hover:text-tremor-content-emphasis dark:text-dark-tremor-content dark:group-hover:text-dark-tremor-content-emphasis">
                  {category}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
