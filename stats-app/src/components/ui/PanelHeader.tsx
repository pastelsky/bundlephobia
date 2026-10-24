import { Badge, Text } from '@tremor/react'
import styles from './PanelHeader.module.css'

interface PanelHeaderProps {
  title: string
  description: string
  unit?: string
}

export function PanelHeader({ title, description, unit }: PanelHeaderProps) {
  return (
    <div className={styles.panelHeading}>
      <div>
        <h2 className="text-sm font-medium text-tremor-content-strong">
          {title}
        </h2>
        <Text className="mt-1 text-xs">{description}</Text>
      </div>
      {unit && (
        <Badge color="slate" size="xs" className={styles.unitLabel}>
          {unit}
        </Badge>
      )}
    </div>
  )
}
