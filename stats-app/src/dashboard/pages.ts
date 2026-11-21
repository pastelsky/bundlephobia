import { CHARTS, type ChartDefinition } from './charts'
import { Activity, Cpu, Hammer, LayoutDashboard, RotateCcw } from 'lucide-react'
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
    title: 'Resources',
    heading: 'Server resources',
    description:
      'CPU, memory, storage, disk I/O, and network usage on the production host.',
    icon: Cpu,
    source: 'resources',
    panels: [
      CHARTS.hostCpu,
      CHARTS.load,
      CHARTS.hostMemory,
      CHARTS.swap,
      CHARTS.disk,
      CHARTS.diskIo,
      CHARTS.ioWait,
      CHARTS.network,
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
    ],
  },
  {
    id: 'workers',
    title: 'PM2 workers',
    heading: 'PM2 workers',
    description:
      'Per-worker restarts, CPU, and memory, with worker status and uptime.',
    icon: RotateCcw,
    source: 'pm2',
    panels: [
      CHARTS.restarts,
      CHARTS.pm2Memory,
      CHARTS.pm2Cpu,
      CHARTS.availability,
      CHARTS.uptime,
    ],
    tabs: [
      {
        id: 'all',
        title: 'All workers',
      },
      {
        id: 'restarts',
        title: 'Restarts & resources',
        panels: [CHARTS.restarts, CHARTS.pm2Memory, CHARTS.pm2Cpu],
      },
      {
        id: 'health',
        title: 'Status & uptime',
        panels: [CHARTS.availability, CHARTS.uptime],
      },
    ],
  },
]

const LEGACY_ROUTES = {
  '/responses': { pageId: 'traffic', tabId: 'responses' },
} satisfies Record<string, { pageId: string; tabId?: string }>

function resolveRouteTarget(pathname: string, requestedTab: string | null) {
  if (pathname === '/responses') {
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
