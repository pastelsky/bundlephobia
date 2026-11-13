export const SOURCE_DETAILS = {
  haproxy: {
    eyebrow: 'WEBSITE ANALYTICS',
    healthy: 'HAProxy scrape healthy',
    section: 'TRAFFIC & RELIABILITY',
    scope: 'Website frontend · background health checks excluded',
    footer: 'HAProxy metrics',
  },
  pipeline: {
    eyebrow: 'APPLICATION SERVICES',
    healthy: 'Services collecting',
    section: 'CACHE & PROCESSING',
    scope: 'Cache coverage · outcomes · duration',
    footer: 'Application metrics',
  },
  resources: {
    eyebrow: 'HOST MONITORING',
    healthy: 'Host metrics collecting',
    section: 'HOST RESOURCE USAGE',
    scope: 'Whole server · sampled once per minute',
    footer: 'Host resource counters',
  },
  pm2: {
    eyebrow: 'PROCESS SUPERVISION',
    healthy: 'PM2 metadata collecting',
    section: 'PM2 WORKERS',
    scope: 'Restart history · process state · CPU & memory',
    footer: 'PM2 process metadata',
  },
}

export type DashboardSource = keyof typeof SOURCE_DETAILS
