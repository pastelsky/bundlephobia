import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Select, SelectItem } from '@tremor/react'
import { ExternalLink, Radio } from 'lucide-react'
import { PAGES } from '../pages'

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <>
      <aside className="fixed inset-y-0 left-0 flex w-[var(--sidebar-width)] flex-col bg-stats-sidebar px-4 pb-5 pt-7 text-slate-400 compact:items-center compact:px-2 compact:py-6 mobile:hidden">
        <a
          href="/"
          className="flex items-center gap-2.5 px-2.5 pb-7 text-base font-semibold tracking-[-0.5px] text-white compact:px-0"
        >
          <span className="flex h-8 w-[30px] items-center justify-center text-[34px] font-semibold leading-none tracking-[-3px]">
            b<span className="text-orange-400">.</span>
          </span>
          <span className="compact:hidden">
            bundlephobia
            <small className="mt-1 block text-[8px] tracking-[2.2px] text-slate-500">
              OBSERVABILITY
            </small>
          </span>
        </a>
        <div className="flex items-center gap-2.5 rounded-[9px] border border-slate-700 p-3 text-xs text-slate-200 compact:hidden">
          <span className="grid size-[31px] place-items-center rounded-[7px] bg-slate-700 font-semibold text-slate-300">
            B
          </span>
          <span>
            Bundlephobia
            <small className="mt-1 flex items-center gap-[5px] text-[10px] text-slate-400">
              <span className="inline-block size-1.5 rounded-full bg-emerald-400" />
              Production
            </small>
          </span>
        </div>
        <span className="mx-3 mb-3 mt-[30px] text-[9px] font-semibold tracking-[1.5px] text-slate-500 compact:hidden">
          MONITORING
        </span>
        <nav
          className="grid gap-[5px] compact:mt-5"
          aria-label="Dashboard pages"
        >
          {PAGES.map(page => (
            <NavLink
              key={page.id}
              to={`/${page.id}`}
              className={({ isActive }) =>
                `flex items-center gap-[11px] rounded-[7px] px-3 py-[11px] text-[13px] transition-colors hover:bg-slate-800 hover:text-white compact:size-[42px] compact:justify-center compact:p-3 ${isActive ? 'bg-slate-700 font-medium text-white' : ''}`
              }
            >
              {({ isActive }) => (
                <>
                  <page.icon
                    size={17}
                    className={
                      isActive ? 'shrink-0 text-orange-400' : 'shrink-0'
                    }
                  />
                  <span className="compact:sr-only">{page.title}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto text-[10px] compact:hidden">
          <a
            href="/stats/vmui/"
            className="flex items-center gap-2.5 px-3 py-4"
          >
            <ExternalLink size={15} />
            Open query explorer
          </a>
          <div className="flex items-center gap-[9px] border-t border-slate-700 px-1 pt-[18px] text-[9px] text-slate-300">
            <Radio size={16} className="shrink-0 text-orange-400" />
            <span>
              Powered by VictoriaMetrics
              <small className="mt-1 block text-[8px] text-slate-500">
                Stored metrics history
              </small>
            </span>
          </div>
        </div>
      </aside>
      <nav
        className="hidden border-b border-stats-border bg-stats-surface px-[18px] py-3 mobile:block"
        aria-label="Dashboard pages"
      >
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
