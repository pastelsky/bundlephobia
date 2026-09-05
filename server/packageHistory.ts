import semver from 'semver'

import type { PackageHistoryResponse } from '../types/package-history'
import firebaseUtils from '../utils/firebase.utils'
import { fetchPackagePackument } from './clients/npmRegistry'
import { parseGithubRepository } from './packages/repository'
import { canonicalGithubRepository } from './trends/repositories'

type HistorySnapshot = {
  size?: number
  gzip?: number
}

export type PackageHistoryOptions = {
  from?: string
  to?: string
  limit: number
}

function inRange(date: string, options: PackageHistoryOptions): boolean {
  return (
    (!options.from || date >= options.from) &&
    (!options.to || date <= options.to)
  )
}

function releaseMetadata(
  time: Record<string, string> | undefined,
  options: PackageHistoryOptions,
): Pick<PackageHistoryResponse, 'releases'> {
  const releases = Object.entries(time || {})
    .flatMap(([version, rawDate]) => {
      const parsed = semver.parse(version)
      if (
        !parsed ||
        parsed.prerelease.length > 0 ||
        typeof rawDate !== 'string'
      ) {
        return []
      }

      const publishedAt = rawDate.slice(0, 10)
      if (!inRange(publishedAt, options)) return []

      const major = parsed.minor === 0 && parsed.patch === 0
      const minor = parsed.patch === 0 && parsed.minor > 0
      if (!major && !minor) return []

      return [{ version, publishedAt, major, minor }]
    })
    .sort((a, b) => {
      const byDate = a.publishedAt.localeCompare(b.publishedAt)
      return byDate || semver.compare(a.version, b.version)
    })

  return { releases }
}

export async function fetchPackageHistory(
  packageName: string,
  options: PackageHistoryOptions,
): Promise<PackageHistoryResponse> {
  const [packument, rawHistory] = await Promise.all([
    fetchPackagePackument(packageName),
    firebaseUtils.getPackageHistory(packageName, options.limit),
  ])
  const history = rawHistory as Record<string, HistorySnapshot>
  const publishDates = Object.fromEntries(
    Object.entries(packument.time || {})
      .filter(
        ([version, rawDate]) =>
          Boolean(semver.valid(version)) && typeof rawDate === 'string',
      )
      .map(([version, rawDate]) => [version, rawDate.slice(0, 10)]),
  )
  const latestVersion = packument['dist-tags']?.latest
  const latestManifest = latestVersion
    ? packument.versions?.[latestVersion]
    : undefined
  const repository =
    parseGithubRepository(latestManifest?.repository) ||
    parseGithubRepository(packument.repository)

  const versions = Object.entries(history)
    .map(([version, snapshot]) => {
      const publishedAt = publishDates[version] || null
      return {
        version,
        publishedAt,
        size: typeof snapshot?.size === 'number' ? snapshot.size : null,
        gzip: typeof snapshot?.gzip === 'number' ? snapshot.gzip : null,
        built:
          typeof snapshot?.size === 'number' ||
          typeof snapshot?.gzip === 'number',
      }
    })
    .filter(
      version =>
        !options.from ||
        (version.publishedAt !== null && version.publishedAt >= options.from),
    )
    .filter(
      version =>
        !options.to ||
        (version.publishedAt !== null && version.publishedAt <= options.to),
    )
    .sort((a, b) => {
      const byDate = (a.publishedAt || '').localeCompare(b.publishedAt || '')
      return byDate || semver.compare(a.version, b.version)
    })

  return {
    name: packageName,
    repository: repository ? canonicalGithubRepository(repository) : null,
    versions,
    ...releaseMetadata(packument.time, options),
    range: {
      from: options.from || null,
      to: options.to || null,
    },
  }
}
