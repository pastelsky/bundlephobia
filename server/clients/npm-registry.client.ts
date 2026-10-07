import registryFetch from 'npm-registry-fetch'
import pacote from 'pacote'

import {
  getEscapedNpmPackageName,
  type RepositoryField,
} from '../packages/npm-package'

export interface NpmPackageManifest {
  name: string
  version: string
  description?: string
  repository?: RepositoryField
}

export interface NpmPackagePackument {
  'dist-tags'?: Record<string, string>
  time?: Record<string, string>
  versions?: Record<string, NpmPackageManifest>
  repository?: RepositoryField
}

function registryManifestPath(name: string, version: string): string {
  return `/${getEscapedNpmPackageName(name)}/${encodeURIComponent(version)}`
}

export function fetchPackageManifest(
  spec: string,
  options: { fullMetadata: boolean },
): Promise<NpmPackageManifest> {
  return pacote.manifest<NpmPackageManifest>(spec, options)
}

export function fetchPackageVersionManifest(
  name: string,
  version: string,
): Promise<NpmPackageManifest> {
  return registryFetch.json<NpmPackageManifest>(
    registryManifestPath(name, version),
  )
}

/** Fetches full registry metadata, including release dates and manifests. */
export function fetchPackagePackument(
  packageName: string,
): Promise<NpmPackagePackument> {
  return pacote.packument<NpmPackagePackument>(packageName, {
    fullMetadata: true,
  })
}
