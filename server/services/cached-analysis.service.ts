import semver from 'semver'
import { z } from 'zod'

import type { PackageBuildInfo } from '@bundlephobia/service-contracts/package'
import CacheServiceClient from '../clients/cache-service.client'
import {
  fetchPackageManifest,
  fetchPackageVersionManifest,
} from '../clients/npm-registry.client'
import {
  parseNpmRegistryPackageSpec,
  type NpmRegistryPackageSpec,
} from '../packages/npm-package'

interface VersionCache {
  get(key: string): Promise<string> | undefined
  set(key: string, value: Promise<string>): void
  del(key: string): void
}

// SAFETY: the pinned lru-cache v6 exposes this constructor and get/set/del API.
const LRU = require('lru-cache') as new (options: {
  max: number
  maxAge: number
}) => VersionCache

// Legacy cache entries may contain only sizes; SSR needs the complete display contract.
const pageResultSchema = z.object({
  name: z.string(),
  version: z.string(),
  size: z.number(),
  gzip: z.number(),
  description: z.string(),
  repository: z.string(),
  dependencyCount: z.number(),
  hasSideEffects: z.union([z.boolean(), z.array(z.string())]),
  hasJSModule: z.boolean(),
  hasJSNext: z.boolean(),
  isModuleType: z.boolean(),
  ignoredMissingDependencies: z.array(z.string()).optional(),
  dependencySizes: z
    .array(z.object({ name: z.string(), approximateSize: z.number() }))
    .optional(),
})

export function createCachedAnalysisReader(
  client: Pick<
    CacheServiceClient,
    'getPackageSize' | 'getExportsSize'
  > = new CacheServiceClient(),
  registry = { fetchPackageManifest, fetchPackageVersionManifest },
) {
  // Share bounded resolution work; never install or analyze a package.
  const versions = new LRU({ max: 2000, maxAge: 5 * 60 * 1000 })

  function fetchVersion(
    specifier: string,
    spec: NpmRegistryPackageSpec,
    version: string,
  ) {
    const options = { timeout: 3000, fetchRetries: 0 }

    return (
      spec.type === 'tag' || version === 'latest'
        ? registry.fetchPackageVersionManifest(spec.name, version, options)
        : registry.fetchPackageManifest(specifier, {
            ...options,
            fullMetadata: false,
          })
    ).then(manifest => manifest.version)
  }

  async function resolveKey(specifier: string) {
    const spec = parseNpmRegistryPackageSpec(specifier)

    if (!spec) throw new TypeError('Expected an npm registry package')

    const exactVersion = semver.valid(spec.fetchSpec)

    if (exactVersion) return { name: spec.name, version: exactVersion }

    const requestedVersion = spec.fetchSpec === '*' ? 'latest' : spec.fetchSpec
    const key = `${spec.name}@${requestedVersion}`
    let pending = versions.get(key)

    if (!pending) {
      pending = fetchVersion(specifier, spec, requestedVersion)
      versions.set(key, pending)
      void pending.catch(() => {
        versions.del(key)
      })
    }

    return { name: spec.name, version: await pending }
  }

  async function read(
    specifier: string,
    operation: 'size' | 'exports-sizes' = 'size',
  ) {
    const key = await resolveKey(specifier)

    return operation === 'size'
      ? client.getPackageSize(key)
      : client.getExportsSize(key)
  }

  async function readPackage(
    specifier: string,
  ): Promise<PackageBuildInfo | null> {
    const result = await read(specifier)

    if (result.status !== 'hit') return null
    const parsed = pageResultSchema.safeParse(result.value)

    return parsed.success ? parsed.data : null
  }

  return { read, readPackage }
}

export const { readPackage: readCachedPackage } = createCachedAnalysisReader()
