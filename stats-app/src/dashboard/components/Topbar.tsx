import { Badge } from '@tremor/react'
import { ChevronRight } from 'lucide-react'

export function Topbar({ title }: { title: string }) {
  return (
    <header className="flex h-[52px] items-center justify-between border-b border-stats-border bg-stats-surface px-6 text-[11px] text-stats-muted mobile:px-[18px]">
      <span className="flex items-center gap-3">
        Infrastructure
        <ChevronRight size={13} />
        <strong className="font-medium text-slate-600">{title}</strong>
      </span>
      <Badge color="emerald" size="xs">
        Production
      </Badge>
    </header>
  )
}
