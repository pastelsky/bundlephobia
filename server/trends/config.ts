const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export const trendsConfig = {
  cacheTtlMs: {
    downloads: 6 * HOUR_MS,
    downloadWindow: DAY_MS,
    githubHistory: 12 * HOUR_MS,
    githubSnapshot: HOUR_MS,
    releases: 12 * HOUR_MS,
    repository: DAY_MS,
    sizeHistory: 6 * HOUR_MS,
  },
  downloads: {
    daysPerWeek: 7,
    historicalWindowMonths: 6,
  },
} as const
