import {
  Activity,
  Cpu,
  Hammer,
  LayoutDashboard,
  ShieldAlert,
} from 'lucide-react'

// Navigation and panel placement live here. Panels and their MetricsQL queries
// live in metrics.ts, so adding a page does not require another renderer.
export const PAGES = [
  {
    id: 'overview',
    title: 'Overview',
    heading: 'Traffic overview',
    description: 'Requests, response health, and connections at a glance.',
    icon: LayoutDashboard,
    source: 'haproxy',
    panels: ['requests', 'responses'],
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
    panels: ['requests', 'bandwidth', 'sessions'],
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
    panels: ['responses'],
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
      'host-cpu',
      'host-load',
      'host-memory',
      'host-disk',
      'host-network',
      'host-swap',
    ],
    breakdown: false,
    tabs: [
      {
        id: 'all',
        title: 'All resources',
        panels: [
          'host-cpu',
          'host-load',
          'host-memory',
          'host-disk',
          'host-network',
          'host-swap',
        ],
      },
      {
        id: 'compute',
        title: 'CPU & memory',
        panels: ['host-cpu', 'host-load', 'host-memory', 'host-swap'],
      },
      {
        id: 'storage',
        title: 'Disk & network',
        panels: ['host-disk', 'host-network'],
      },
    ],
  },
  {
    id: 'pipeline',
    title: 'Builds & installs',
    heading: 'Builds & installations',
    description:
      'Completed attempts in the application services, excluding cache hits.',
    icon: Hammer,
    source: 'pipeline',
    panels: ['build-outcomes', 'install-outcomes'],
    breakdown: false,
    tabs: [
      {
        id: 'all',
        title: 'All activity',
        panels: ['build-outcomes', 'install-outcomes'],
      },
      { id: 'builds', title: 'Builds', panels: ['build-outcomes'] },
      { id: 'installs', title: 'Installations', panels: ['install-outcomes'] },
    ],
  },
]
