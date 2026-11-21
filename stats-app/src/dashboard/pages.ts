import { CHARTS, type ChartDefinition } from './charts'
import { Activity, Cpu, Hammer, LayoutDashboard } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { DashboardSource } from './sources'

export type BreakdownKind = 'responses' | 'disk'

export interface DashboardTab {
  id: string
  title: string
  panels?: ChartDefinition[]
  breakdown?: BreakdownKind
}

export interface DashboardPage {
  id: string
  title: string
  heading: string
  description: string
  icon: LucideIcon
  source: DashboardSource
  panels: ChartDefinition[]
  tabs: DashboardTab[]
}

export const PAGES: DashboardPage[] = [
  {
    id: 'overview',
    title: 'Overview',
    heading: 'Production overview',
    description:
      'Golden signals across traffic, errors, cache, build latency, queues, and host CPU.',
    icon: LayoutDashboard,
    source: 'haproxy',
    panels: [
      CHARTS.requests,
      CHARTS.errorRate,
      CHARTS.cacheShare,
      CHARTS.buildDuration,
      CHARTS.queueBacklog,
      CHARTS.hostCpu,
    ],
    tabs: [],
  },
  {
    id: 'traffic',
    title: 'Traffic',
    heading: 'Website traffic & reliability',
    description:
      'Request volume, HTTP status classes, error rates, and bandwidth.',
    icon: Activity,
    source: 'haproxy',
    panels: [
      CHARTS.requests,
      CHARTS.responses,
      CHARTS.errorRate,
      CHARTS.sessions,
    ],
    tabs: [
      {
        id: 'overview',
        title: 'Overview',
        panels: [
          CHARTS.requests,
          CHARTS.responses,
          CHARTS.errorRate,
          CHARTS.sessions,
        ],
      },
      {
        id: 'responses',
        title: 'Response health',
        panels: [CHARTS.responses, CHARTS.errorRate],
        breakdown: 'responses',
      },
      {
        id: 'bandwidth',
        title: 'Bandwidth & sessions',
        panels: [CHARTS.bandwidth, CHARTS.sessions],
      },
    ],
  },
  {
    id: 'pipeline',
    title: 'Builds & installs',
    heading: 'Builds & installations',
    description: 'Latency percentiles, queues, outcomes, and cache coverage.',
    icon: Hammer,
    source: 'pipeline',
    panels: [
      CHARTS.buildDuration,
      CHARTS.installDuration,
      CHARTS.queueBacklog,
      CHARTS.queueRunning,
      CHARTS.builds,
      CHARTS.buildFailures,
      CHARTS.installs,
      CHARTS.buildRequests,
      CHARTS.cacheShare,
      CHARTS.cacheResponses,
    ],
    tabs: [
      {
        id: 'latency',
        title: 'Latency & queues',
        panels: [
          CHARTS.buildDuration,
          CHARTS.installDuration,
          CHARTS.queueBacklog,
          CHARTS.queueRunning,
        ],
      },
      {
        id: 'outcomes',
        title: 'Outcomes & failures',
        panels: [
          CHARTS.builds,
          CHARTS.buildFailures,
          CHARTS.installs,
          CHARTS.buildRequests,
        ],
      },
      {
        id: 'cache',
        title: 'Cache',
        panels: [CHARTS.cacheShare, CHARTS.cacheResponses],
      },
      {
        id: 'all',
        title: 'All activity',
      },
    ],
  },
  {
    id: 'resources',
    title: 'Host & workers',
    heading: 'Host resources & PM2 workers',
    description:
      'Server CPU, memory, disk I/O, network, and PM2 worker health.',
    icon: Cpu,
    source: 'resources',
    panels: [
      CHARTS.hostCpu,
      CHARTS.load,
      CHARTS.hostMemory,
      CHARTS.swap,
      CHARTS.disk,
      CHARTS.diskIo,
      CHARTS.network,
      CHARTS.restarts,
      CHARTS.pm2Memory,
      CHARTS.pm2Cpu,
      CHARTS.availability,
      CHARTS.uptime,
    ],
    tabs: [
      {
        id: 'compute',
        title: 'CPU & memory',
        panels: [CHARTS.hostCpu, CHARTS.load, CHARTS.hostMemory, CHARTS.swap],
      },
      {
        id: 'storage',
        title: 'Disk & network',
        panels: [CHARTS.disk, CHARTS.diskIo, CHARTS.ioWait, CHARTS.network],
        breakdown: 'disk',
      },
      {
        id: 'workers',
        title: 'PM2 workers',
        panels: [
          CHARTS.restarts,
          CHARTS.pm2Memory,
          CHARTS.pm2Cpu,
          CHARTS.availability,
          CHARTS.uptime,
        ],
      },
    ],
  },
]

const LEGACY_ROUTES = {
  '/responses': { pageId: 'traffic', tabId: 'responses' },
  '/workers': { pageId: 'resources', tabId: 'workers' },
} satisfies Record<string, { pageId: string; tabId?: string }>

function resolveRouteTarget(pathname: string, requestedTab: string | null) {
  if (pathname === '/responses' || pathname === '/workers') {
    const legacy = LEGACY_ROUTES[pathname]

    return { pageId: legacy.pageId, targetTab: requestedTab ?? legacy.tabId }
  }

  return { pageId: pathname.replace(/^\//, ''), targetTab: requestedTab }
}

export function resolvePage(pathname: string, requestedTab: string | null) {
  const { pageId, targetTab } = resolveRouteTarget(pathname, requestedTab)
  const page = PAGES.find(entry => entry.id === pageId) ?? PAGES[0]
  const tab = page.tabs.find(entry => entry.id === targetTab) ?? page.tabs[0]

  return {
    page,
    tabId: tab?.id,
    panels: tab?.panels ?? page.panels,
    breakdown: tab?.breakdown,
  }
}
