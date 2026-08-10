import parsePackageSpec from 'npm-package-arg'

export type NpmRegistryPackageSpec = parsePackageSpec.RegistryResult & {
  name: string
  escapedName: string
}

function isAliasPackageSpec(
  spec: parsePackageSpec.Result
): spec is parsePackageSpec.AliasResult {
  return spec.type === 'alias'
}

function isRegistryPackageSpec(
  spec: parsePackageSpec.Result
): spec is NpmRegistryPackageSpec {
  return spec.registry && Boolean(spec.name) && Boolean(spec.escapedName)
}

/** Resolves npm aliases to the registry package they target. */
export function parseNpmRegistryPackageSpec(
  packageSpecifier: string
): NpmRegistryPackageSpec | null {
  const parsed = parsePackageSpec(packageSpecifier)
  const target = isAliasPackageSpec(parsed) ? parsed.subSpec : parsed
  return isRegistryPackageSpec(target) ? target : null
}

/** Returns npm's canonical escaped package name for use in npm API paths. */
export function getEscapedNpmPackageName(packageSpecifier: string): string {
  const packageSpec = parseNpmRegistryPackageSpec(packageSpecifier)
  if (!packageSpec) {
    throw new TypeError(`Expected an npm registry package: ${packageSpecifier}`)
  }
  return packageSpec.escapedName
}
