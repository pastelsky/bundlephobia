import { NavLink } from 'react-router-dom'
import { ExternalLink, Radio } from 'lucide-react'
import { PAGES } from '../pages'

export function Sidebar() {
  return (
    <aside className="sidebar">
      <a href="/" className="brand">
        <span className="brand-symbol">
          b<span>.</span>
        </span>
        <span>
          bundlephobia<small>OBSERVABILITY</small>
        </span>
      </a>
      <div className="workspace-label">
        <span className="workspace-avatar">B</span>
        <span>
          Bundlephobia
          <small>
            <span className="environment-dot" />
            Production
          </small>
        </span>
      </div>
      <span className="nav-label">MONITORING</span>
      <nav aria-label="Dashboard pages">
        {PAGES.map(page => (
          <NavLink
            key={page.id}
            to={`/${page.id}`}
            className={({ isActive }) => (isActive ? 'nav-primary' : undefined)}
          >
            <page.icon size={17} />
            {page.title}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <a href="/stats/vmui/">
          <ExternalLink size={15} />
          Open query explorer
        </a>
        <div className="storage-note">
          <Radio size={16} />
          <span>
            Powered by VictoriaMetrics
            <small>60-second scrape · 15-day retention</small>
          </span>
        </div>
      </div>
    </aside>
  )
}
