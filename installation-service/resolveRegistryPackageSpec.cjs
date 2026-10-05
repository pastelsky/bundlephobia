const npa = require('npm-package-arg')

const pacote = require('pacote')

const semver = require('semver')

const { z } = require('zod')

const manifestSchema = z.object({ name: z.string(), version: z.string() })

class UnsupportedRegistryPackageSpecError extends Error {}

/** Resolves an npm tag or range to the exact package version used for installation. */
async function resolveRegistryPackageSpec(
  packageString,
  manifest = pacote.manifest,
) {
  let spec

  try {
    spec = npa(packageString)
  } catch (error) {
    throw new UnsupportedRegistryPackageSpecError(error.message)
  }

  if (!spec.registry || !['tag', 'range', 'version'].includes(spec.type)) {
    throw new UnsupportedRegistryPackageSpecError(
      'packageString must be an npm registry package spec',
    )
  }

  if (spec.type === 'version') {
    return `${spec.name}@${semver.clean(spec.fetchSpec)}`
  }

  const resolved = manifestSchema.parse(
    await manifest(packageString, { fullMetadata: false }),
  )

  return `${resolved.name}@${resolved.version}`
}

module.exports = {
  resolveRegistryPackageSpec,
  UnsupportedRegistryPackageSpecError,
}
