import npa from 'npm-package-arg'

import pacote from 'pacote'

import semver from 'semver'

import { z } from 'zod'

const manifestSchema = z.object({ name: z.string(), version: z.string() })

export class UnsupportedRegistryPackageSpecError extends Error {}

/** Resolves an npm tag or range to the exact package version used for installation. */
export async function resolveRegistryPackageSpec(
  packageString: string,
  manifest: typeof pacote.manifest = pacote.manifest,
): Promise<string> {
  let spec

  try {
    spec = npa(packageString)
  } catch (error) {
    throw new UnsupportedRegistryPackageSpecError(
      error instanceof Error ? error.message : String(error),
    )
  }

  if (!spec.registry || !['tag', 'range', 'version'].includes(spec.type)) {
    throw new UnsupportedRegistryPackageSpecError(
      'packageString must be an npm registry package spec',
    )
  }

  if (spec.type === 'version') {
    const version = semver.clean(spec.fetchSpec)

    if (!version) {
      throw new UnsupportedRegistryPackageSpecError('Invalid package version')
    }

    return `${spec.name}@${version}`
  }

  const resolved = manifestSchema.parse(
    await manifest(packageString, { fullMetadata: false }),
  )

  return `${resolved.name}@${resolved.version}`
}
