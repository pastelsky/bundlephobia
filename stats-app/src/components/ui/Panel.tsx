import { Badge, Card, Text } from '@tremor/react'
import type { ComponentProps } from 'react'

export function Panel({
  className = '',
  ...props
}: ComponentProps<typeof Card>) {
  return (
    <Card
      {...props}
      className={`min-w-0 rounded-[10px] border-stats-border p-4 ${className}`}
    />
  )
}

interface PanelHeaderProps {
  title: string
  description: string
  unit?: string
}

export function PanelHeader({ title, description, unit }: PanelHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-medium text-tremor-content-strong">
          {title}
        </h2>
        <Text className="mt-1 text-xs">{description}</Text>
      </div>
      {unit && (
        <Badge color="slate" size="xs" className="shrink-0 narrow:hidden">
          {unit}
        </Badge>
      )}
    </div>
  )
}
