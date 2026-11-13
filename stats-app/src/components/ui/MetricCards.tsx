import { Icon, Metric, Text, type Color } from '@tremor/react'
import type { LucideIcon } from 'lucide-react'
import { Panel } from './Panel'
import { LoadingPlaceholder } from './LoadingPlaceholder'

export interface MetricCard {
  title: string
  value?: number | null
  format: (value: number) => string
  detail: string
  icon?: LucideIcon
  color?: Color
  tone?: 'positive' | 'negative'
}

const valueColors = { positive: 'text-emerald-700', negative: 'text-rose-700' }

export function MetricCards({
  cards,
  loading,
}: {
  cards: readonly MetricCard[]
  loading: boolean
}) {
  return (
    <div className="grid grid-cols-4 gap-3 compact:grid-cols-2 mobile:gap-2.5">
      {cards.map(card => (
        <Panel
          key={card.title}
          className="px-4 py-3.5 narrow:p-4 compact:px-5 mobile:p-3.5"
        >
          <div className="flex items-center justify-between gap-[5px]">
            <Text className="text-xs font-medium text-slate-500 mobile:text-[10px]">
              {card.title}
            </Text>
            {card.icon && (
              <Icon
                icon={card.icon}
                color={card.color}
                size="sm"
                variant="light"
              />
            )}
          </div>
          {loading ? (
            <LoadingPlaceholder
              label={`Loading ${card.title}`}
              className="mt-[13px] h-[37px] w-[90px] compact:mt-2"
            />
          ) : (
            <Metric
              className={`mt-[13px] text-[27px] font-semibold tracking-[-1.1px] tabular-nums compact:mt-2 ${card.tone ? valueColors[card.tone] : 'text-stats-text'}`}
            >
              {card.value == null ? '—' : card.format(card.value)}
            </Metric>
          )}
          <p className="mt-2 text-[11px] text-stats-muted narrow:text-[10px]">
            {card.detail}
          </p>
        </Panel>
      ))}
    </div>
  )
}
