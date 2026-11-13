import type { CustomTooltipProps } from '@tremor/react'
import { numberFormat } from '../../lib/format'
import { resolveSeriesColor } from '../../lib/colors'

export function SeriesTooltip({
  active,
  payload,
  label,
  format,
  showShare = false,
}: CustomTooltipProps & {
  format: (value: number) => string
  showShare?: boolean
}) {
  if (!active || !payload?.length) return null

  const entries = payload.flatMap(item => {
    const value = Number(item.value)

    return Number.isFinite(value)
      ? [{ name: String(item.name), value, color: item.color }]
      : []
  })

  const total = entries.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="rounded-lg border border-stats-border bg-stats-surface p-3 text-xs shadow-tremor-dropdown">
      <p className="mb-2 font-medium text-stats-text">{String(label)}</p>
      <dl className="grid gap-2">
        {entries.map(item => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-6"
          >
            <dt className="flex items-center gap-2">
              <span
                className="size-2 flex-none rounded-full"
                style={{ backgroundColor: resolveSeriesColor(item.color) }}
              />
              {item.name}
            </dt>
            <dd className="tabular-nums">
              <strong className="font-medium">{format(item.value)}</strong>
              {showShare && (
                <span className="ml-2 text-stats-muted">
                  {total > 0
                    ? `${numberFormat.format((100 * item.value) / total)}%`
                    : '—'}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
