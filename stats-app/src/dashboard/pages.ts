import { CHARTS, type ChartDefinition } from './charts'
import {
  Activity,
  Cpu,
  Hammer,
  LayoutDashboard,
  ShieldAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { DashboardSource } from './sources'

export interface DashboardPage {
  id: string
  title: string
  heading: string
  description: string
  icon: LucideIcon
  source: DashboardSource
  panels: ChartDefinition[]
  breakdown: boolean
  tabs: { id: string; title: string; panels?: ChartDefinition[] }[]
}

// Pages reference chart objects directly; tabs may inherit the full page.
export const PAGES: DashboardPage[] = [
  {
    id: 'overview',
    title: 'Overview',
    heading: 'Traffic overview',
    description: 'Requests, response health, and connections at a glance.',
    icon: LayoutDashboard,
    source: 'haproxy',
    panels: [CHARTS.requests, CHARTS.responses],
    breakdown: false,
    tabs: [],
  },
  {
    id: 'traffic',
    title: 'Traffic',
    heading: 'Website traffic',
    description: 'Request volume, network traffic, and active connections.',
    icon: Activity,
    source: 'haproxy',
    panels: [CHARTS.requests, CHARTS.bandwidth, CHARTS.sessions],
    breakdown: false,
    tabs: [],
  },
  {
    id: 'responses',
    title: 'Response health',
    heading: 'Response health',
    description: 'HTTP status classes across the public website.',
    icon: ShieldAlert,
    source: 'haproxy',
    panels: [CHARTS.responses],
    breakdown: true,
    tabs: [],
  },
  {
    id: 'resources',
    title: 'Resources',
    heading: 'Server resources',
    description:
      'CPU, memory, storage, and network usage on the production host.',
    icon: Cpu,
    source: 'resources',
    panels: [
      CHARTS.cpu,
      CHARTS.load,
      CHARTS.memory,
      CHARTS.disk,
      CHARTS.network,
      CHARTS.swap,
    ],
    breakdown: false,
    tabs: [
      {
        id: 'all',
        title: 'All resources',
      },
      {
        id: 'compute',
        title: 'CPU & memory',
        panels: [CHARTS.cpu, CHARTS.load, CHARTS.memory, CHARTS.swap],
      },
      {
        id: 'storage',
        title: 'Disk & network',
        panels: [CHARTS.disk, CHARTS.network],
      },
    ],
  },
  {
    id: 'pipeline',
    title: 'Builds & installs',
    heading: 'Builds & installations',
    description: 'Cache coverage, queues, outcomes, and processing time.',
    icon: Hammer,
    source: 'pipeline',
    panels: [
      CHARTS.cacheShare,
      CHARTS.cacheResponses,
      CHARTS.builds,
      CHARTS.installs,
      CHARTS.buildDuration,
      CHARTS.installDuration,
      CHARTS.queueBacklog,
      CHARTS.queueRunning,
    ],
    breakdown: false,
    tabs: [
      {
        id: 'all',
        title: 'All activity',
      },
      {
        id: 'queues',
        title: 'Queues',
        panels: [CHARTS.queueBacklog, CHARTS.queueRunning],
      },
      {
        id: 'cache',
        title: 'Cache',
        panels: [CHARTS.cacheShare, CHARTS.cacheResponses],
      },
      {
        id: 'builds',
        title: 'Builds',
        panels: [CHARTS.builds, CHARTS.buildDuration],
      },
      {
        id: 'installs',
        title: 'Installations',
        panels: [CHARTS.installs, CHARTS.installDuration],
      },
    ],
  },
]

export function resolvePage(pathname: string, requestedTab: string | null) {
  const page = PAGES.find(page => pathname === `/${page.id}`) ?? PAGES[0]
  const tab = page.tabs.find(tab => tab.id === requestedTab) ?? page.tabs[0]

  return { page, tabId: tab?.id, panels: tab?.panels ?? page.panels }
}
