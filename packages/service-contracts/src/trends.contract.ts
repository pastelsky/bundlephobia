export const TRENDS_RANGES = [
  'last-2-months',
  'last-year',
  'last-3-years',
] as const

export type TrendsRange = (typeof TRENDS_RANGES)[number]

export const TRENDS_GROUP_BY = ['day', 'week', 'month'] as const

export type TrendsGroupBy = (typeof TRENDS_GROUP_BY)[number]

export const TRENDS_METRICS = [
  'downloads',
  'stars',
  'size',
  'vulnerabilities',
] as const

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

export const TRENDS_VULNERABILITY_SEVERITIES = [
  'critical',
  'high',
  'moderate',
  'low',
] as const

export type TrendsVulnerabilitySeverity =
  (typeof TRENDS_VULNERABILITY_SEVERITIES)[number]

export type TrendsVulnerabilityWindow = {
  from: string
  to: string | null
  introducedVersion?: string
  fixedVersion?: string
}

export type TrendsVulnerabilityAdvisory = {
  id: string
  cve?: string
  summary?: string
  severity: TrendsVulnerabilitySeverity | 'unknown'
  windows: TrendsVulnerabilityWindow[]
}

export type TrendsVulnerabilitySummary = {
  total: number
  active: number
  critical: number
  high: number
  moderate: number
  low: number
}

export type TrendsCurrent = {
  weeklyDownloads: number | null
  stars: number | null
  size: number | null
  gzip: number | null
  vulnerabilities: TrendsVulnerabilitySummary | null
}

export type TrendsPackageSeries = {
  name: string
  repository: string | null
  downloads: TrendsPoint[]
  stars: TrendsPoint[]
  size: TrendsPoint[]
  vulnerabilities: TrendsPoint[]
  advisories?: TrendsVulnerabilityAdvisory[]
  releases: TrendsRelease[]
  current: TrendsCurrent
  warnings: string[]
}

export type TrendsResponse = {
  packages: TrendsPackageSeries[]
  range: TrendsRange
  generatedAt: string
}
