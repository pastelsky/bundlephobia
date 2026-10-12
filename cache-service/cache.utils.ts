import semver from 'semver'

export function encodeFirebaseKey(key: string) {
  return key.replace(/[.]/g, ',').replace(/\//g, '__')
}

export function latestBuiltVersion(versions: string[]): string | null {
  const stableVersions: string[] = []

  for (const key of versions) {
    const version = key.replaceAll(',', '.')

    if (semver.valid(version) && !semver.prerelease(version))
      stableVersions.push(version)
  }

  return stableVersions.sort(semver.rcompare)[0] ?? null
}
