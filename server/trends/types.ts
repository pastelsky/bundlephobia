export type TrendsMetric = 'downloads' | 'stars' | 'size'

export type TrendsRange = 'last-2-months' | 'last-year' | 'last-3-years'

export type TrendsGroupBy = 'day' | 'week' | 'month'

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

export type TrendsPackageSeries = {
  name: string
  repository: string | null
  downloads: TrendsPoint[]
  stars: TrendsPoint[]
  size: TrendsPoint[]
  releases: TrendsRelease[]
  current: {
    weeklyDownloads: number | null
    stars: number | null
    gzip: number | null
    size: number | null
  }
  warnings: string[]
}

export type TrendsResponse = {
  packages: TrendsPackageSeries[]
  range: TrendsRange
  groupBy: TrendsGroupBy
  generatedAt: string
}

export const TRENDS_METRICS: TrendsMetric[] = [
  'downloads',
  'stars',
  'size',
]

export const TRENDS_RANGES: TrendsRange[] = [
  'last-2-months',
  'last-year',
  'last-3-years',
]

export const TRENDS_GROUP_BY: TrendsGroupBy[] = ['day', 'week', 'month']

export const MAX_TRENDS_PACKAGES = 5
