import { Badge, ProgressBar } from '@tremor/react'
import { numberFormat } from '../../lib/format'

export interface CapacitySample {
  used: number
  total: number
  available: number | null
  collected: string
}

export function CapacityReadout({
  sample,
  format,
  emptyLabel = 'No capacity reported',
}: {
  sample: CapacitySample | null
  format: (value: number) => string
  emptyLabel?: string
}) {
  if (!sample) return null

  if (sample.total <= 0)
    return <p className="mt-1 text-[10px] text-stats-muted">{emptyLabel}</p>

  const percent = (sample.used / sample.total) * 100

  return (
    <div className="mt-[18px] grid gap-2">
      <div className="flex items-center justify-between gap-2 text-xs text-stats-muted">
        <p>
          <strong className="font-semibold text-stats-text">
            {format(sample.used)}
          </strong>{' '}
          of {format(sample.total)} used
        </p>
        <Badge color="slate" size="xs">
          {numberFormat.format(percent)}%
        </Badge>
      </div>
      <ProgressBar
        value={Math.max(0, Math.min(100, percent))}
        color="orange"
        showAnimation={false}
        tooltip={`${numberFormat.format(percent)}% used`}
        aria-label="Capacity used"
      />
      <div className="mt-1 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] text-stats-muted">
        {sample.available != null && (
          <span>{format(sample.available)} available</span>
        )}
        <span>Latest sample · {sample.collected}</span>
      </div>
    </div>
  )
}
