import { Badge } from '@tremor/react'
import { ChevronRight } from 'lucide-react'
import styles from './Topbar.module.css'

export function Topbar({ title }: { title: string }) {
  return (
    <header className={styles.topbar}>
      <span>
        Infrastructure
        <ChevronRight size={13} />
        <strong>{title}</strong>
      </span>
      <Badge color="emerald" size="xs">
        Production
      </Badge>
    </header>
  )
}
