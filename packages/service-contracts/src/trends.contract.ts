export const TRENDS_RANGES = [
  'last-2-months',
  'last-year',
  'last-3-years',
] as const

export type TrendsRange = (typeof TRENDS_RANGES)[number]

export const TRENDS_GROUP_BY = ['day', 'week', 'month'] as const

export type TrendsGroupBy = (typeof TRENDS_GROUP_BY)[number]

export const TRENDS_METRICS = ['downloads', 'stars', 'size'] as const

export type TrendsMetric = (typeof TRENDS_METRICS)[number]

export const MAX_TRENDS_PACKAGES = 5

export type TrendsPoint = {
  date: string
  value: number
  version?: string
  partial?: boolean
}

export type TrendsRelease = {
  version: string
  date: string
  major: boolean
  minor: boolean
}

export type TrendsCurrent = {
  weeklyDownloads: number | null
  stars: number | null
  size: number | null
  gzip: number | null
}

export type TrendsPackageSeries = {
  name: string
  repository: string | null
  downloads: TrendsPoint[]
  stars: TrendsPoint[]
  size: TrendsPoint[]
  releases: TrendsRelease[]
  current: TrendsCurrent
  warnings: string[]
}

export type TrendsResponse = {
  packages: TrendsPackageSeries[]
  range: TrendsRange
  groupBy: TrendsGroupBy
  generatedAt: string
}
