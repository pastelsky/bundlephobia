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
  options: { fullMetadata: boolean; timeout?: number; fetchRetries?: number },
): Promise<NpmPackageManifest> {
  return pacote.manifest<NpmPackageManifest>(spec, options)
}

export function fetchPackageVersionManifest(
  name: string,
  version: string,
  options?: { timeout?: number; fetchRetries?: number },
): Promise<NpmPackageManifest> {
  const path = registryManifestPath(name, version)

  if (!options) return registryFetch.json<NpmPackageManifest>(path)

  return registryFetch.json<NpmPackageManifest>(path, options)
}

/** Fetches full registry metadata, including release dates and manifests. */
export function fetchPackagePackument(
  packageName: string,
): Promise<NpmPackagePackument> {
  return pacote.packument<NpmPackagePackument>(packageName, {
    fullMetadata: true,
  })
}
