import type { RepositoryField } from '../packages/repository'
import { getEscapedNpmPackageName } from '../packages/npmPackage'

export interface NpmPackageManifest {
  name: string
  version: string
  description?: string
  repository?: RepositoryField
  [key: string]: unknown
}

export interface NpmPackagePackument {
  'dist-tags'?: Record<string, string>
  time?: Record<string, string>
  versions?: Record<string, NpmPackageManifest>
  repository?: RepositoryField
}

interface PacoteModule {
  manifest(
    spec: string,
    options: { fullMetadata: boolean },
  ): Promise<NpmPackageManifest>
  packument(
    spec: string,
    options: { fullMetadata: boolean },
  ): Promise<NpmPackagePackument>
}

interface NpmRegistryFetchModule {
  json(path: string): Promise<NpmPackageManifest>
}

const pacote = require('pacote') as PacoteModule
const registryFetch = require('npm-registry-fetch') as NpmRegistryFetchModule

function registryManifestPath(name: string, version: string): string {
  return `/${getEscapedNpmPackageName(name)}/${encodeURIComponent(version)}`
}

export function fetchPackageManifest(
  spec: string,
  options: { fullMetadata: boolean },
): Promise<NpmPackageManifest> {
  return pacote.manifest(spec, options)
}

export function fetchPackageVersionManifest(
  name: string,
  version: string,
): Promise<NpmPackageManifest> {
  return registryFetch.json(registryManifestPath(name, version))
}

/** Fetches full registry metadata, including release dates and manifests. */
export function fetchPackagePackument(
  packageName: string,
): Promise<NpmPackagePackument> {
  return pacote.packument(packageName, { fullMetadata: true })
}
