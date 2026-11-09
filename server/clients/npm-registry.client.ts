import registryFetch from 'npm-registry-fetch'
import pacote from 'pacote'

import {
  getEscapedNpmPackageName,
  type RepositoryField,
} from '../packages/npm-package'
import { extractPackumentMetadataFromStream } from './npm-packument-stream'

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

/**
 * Fetches package release history and metadata using the zero-decode streaming extractor.
 *
 * This intentionally bypasses `pacote.packument({ fullMetadata: true })` which buffers
 * and deserializes the entire multi-megabyte `versions` tree into V8 heap.
 */
export async function fetchPackagePackument(
  packageName: string,
): Promise<NpmPackagePackument> {
  const path = `/${getEscapedNpmPackageName(packageName)}`

  const response = await registryFetch(path, {
    headers: { Accept: 'application/json' },
  })

  const extracted = await extractPackumentMetadataFromStream(response.body)

  let repository = extracted.repository

  // Fallback: if the package did not declare repository at root, query latest manifest
  if (!repository && extracted.distTags?.latest) {
    try {
      const latest = await fetchPackageVersionManifest(
        packageName,
        extracted.distTags.latest,
      )

      repository = latest.repository
    } catch {
      // Ignore fallback failure
    }
  }

  return {
    'dist-tags': extracted.distTags,
    time: extracted.time,
    repository,
  }
}
