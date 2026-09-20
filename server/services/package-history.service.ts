import semver from 'semver'

import firebaseUtils from '../../utils/firebase.utils'
import type { PackageBuildInfoSnapshot } from '@bundlephobia/service-contracts/package'
import type {
  PackageHistoryRelease,
  PackageHistoryResponse,
  PackageHistoryVersion,
} from '../../types/package-history'
import {
  fetchPackagePackument,
  type NpmPackagePackument,
} from '../clients/npm-registry.client'
import { parseGithubRepository } from '../packages/npm-package'

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

function parseRelease(
  version: string,
  rawDate: string,
  options: PackageHistoryOptions,
): PackageHistoryRelease | null {
  const parsed = semver.parse(version)

  if (!parsed || parsed.prerelease.length > 0) {
    return null
  }

  const publishedAt = rawDate.slice(0, 10)

  if (!inRange(publishedAt, options)) {
    return null
  }

  const major = parsed.minor === 0 && parsed.patch === 0
  const minor = parsed.patch === 0 && parsed.minor > 0

  if (!major && !minor) {
    return null
  }

  return { version, publishedAt, major, minor }
}

function releaseMetadata(
  time: Record<string, string> | undefined,
  options: PackageHistoryOptions,
): Pick<PackageHistoryResponse, 'releases'> {
  const releases = Object.entries(time ?? {})
    .flatMap(([version, rawDate]) => {
      const release = parseRelease(version, rawDate, options)

      return release ? [release] : []
    })
    .sort((a, b) => {
      const byDate = a.publishedAt.localeCompare(b.publishedAt)

      return byDate || semver.compare(a.version, b.version)
    })

  return { releases }
}

function getPublishDates(
  time: Record<string, string> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(time ?? {})
      .filter(([version]) => Boolean(semver.valid(version)))
      .map(([version, rawDate]) => [version, rawDate.slice(0, 10)]),
  )
}

function toHistoryVersion(
  version: string,
  snapshot: PackageBuildInfoSnapshot,
  publishDates: Record<string, string>,
): PackageHistoryVersion {
  const size = snapshot.size ?? null
  const gzip = snapshot.gzip ?? null

  return {
    version,
    publishedAt: publishDates[version] ?? null,
    size,
    gzip,
    built: size !== null || gzip !== null,
  }
}

function isVersionInRange(
  version: PackageHistoryVersion,
  options: PackageHistoryOptions,
): boolean {
  if (
    options.from &&
    (!version.publishedAt || version.publishedAt < options.from)
  ) {
    return false
  }

  if (
    options.to &&
    (!version.publishedAt || version.publishedAt > options.to)
  ) {
    return false
  }

  return true
}

function sortVersions(
  versions: PackageHistoryVersion[],
): PackageHistoryVersion[] {
  return versions.sort((a, b) => {
    const byDate = (a.publishedAt ?? '').localeCompare(b.publishedAt ?? '')

    return byDate || semver.compare(a.version, b.version)
  })
}

function repositoryForPackument(packument: NpmPackagePackument): string | null {
  const latestVersion = packument['dist-tags']?.latest

  const latestRepository = latestVersion
    ? packument.versions?.[latestVersion]?.repository
    : undefined

  return (
    parseGithubRepository(latestRepository) ||
    parseGithubRepository(packument.repository)
  )
}

export async function fetchPackageHistory(
  packageName: string,
  options: PackageHistoryOptions,
): Promise<PackageHistoryResponse> {
  const packument = await fetchPackagePackument(packageName)
  const publishDates = getPublishDates(packument.time)

  const history = await firebaseUtils.getPackageHistory(
    packageName,
    options.limit,
    version => {
      const publishedAt = publishDates[version]

      return publishedAt ? inRange(publishedAt, options) : false
    },
  )

  const repository = repositoryForPackument(packument)

  const versions = sortVersions(
    Object.entries(history)
      .map(([version, snapshot]) =>
        toHistoryVersion(version, snapshot, publishDates),
      )
      .filter(version => isVersionInRange(version, options)),
  )

  return {
    name: packageName,
    repository,
    versions,
    ...releaseMetadata(packument.time, options),
    range: {
      from: options.from ?? null,
      to: options.to ?? null,
    },
  }
}
