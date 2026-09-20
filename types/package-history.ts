export type PackageHistoryRelease = {
  version: string
  publishedAt: string
  major: boolean
  minor: boolean
}

export type PackageHistoryVersion = {
  version: string
  publishedAt: string | null
  size: number | null
  gzip: number | null
  built: boolean
}

export type PackageHistoryResponse = {
  name: string
  repository: string | null
  versions: PackageHistoryVersion[]
  releases: PackageHistoryRelease[]
  range: {
    from: string | null
    to: string | null
  }
}
