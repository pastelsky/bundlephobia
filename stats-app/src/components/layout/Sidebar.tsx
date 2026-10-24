import styles from './Sidebar.module.css'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Select, SelectItem } from '@tremor/react'
import { ExternalLink, Radio } from 'lucide-react'
import { PAGES } from '../../dashboard/pages'

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <>
      <aside className={styles.sidebar}>
        <a href="/" className={styles.brand}>
          <span className={styles.brandSymbol}>
            b<span>.</span>
          </span>
          <span>
            bundlephobia<small>OBSERVABILITY</small>
          </span>
        </a>
        <div className={styles.workspaceLabel}>
          <span className={styles.workspaceAvatar}>B</span>
          <span>
            Bundlephobia
            <small>
              <span className={styles.environmentDot} />
              Production
            </small>
          </span>
        </div>
        <span className={styles.navLabel}>MONITORING</span>
        <nav aria-label="Dashboard pages">
          {PAGES.map(page => (
            <NavLink
              key={page.id}
              to={`/${page.id}`}
              className={({ isActive }) =>
                isActive ? styles.navPrimary : undefined
              }
            >
              <page.icon size={17} />
              {page.title}
            </NavLink>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <a href="/stats/vmui/">
            <ExternalLink size={15} />
            Open query explorer
          </a>
          <div className={styles.storageNote}>
            <Radio size={16} />
            <span>
              Powered by VictoriaMetrics
              <small>60-second scrape · 15-day retention</small>
            </span>
          </div>
        </div>
      </aside>
      <nav className={styles.mobileNav} aria-label="Dashboard pages">
        <Select
          value={location.pathname}
          onValueChange={value => navigate(value)}
          enableClear={false}
        >
          {PAGES.map(page => (
            <SelectItem key={page.id} value={`/${page.id}`} icon={page.icon}>
              {page.title}
            </SelectItem>
          ))}
        </Select>
      </nav>
    </>
  )
}
