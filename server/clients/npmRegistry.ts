interface PacoteModule {
  packument(
    spec: string,
    options: { fullMetadata: boolean },
  ): Promise<NpmPackagePackument>
}

const pacote = require('pacote') as PacoteModule

export type RepositoryField = string | { url?: string }

export type NpmPackageManifest = {
  name?: string
  version?: string
  repository?: RepositoryField
}

export type NpmPackagePackument = {
  'dist-tags'?: Record<string, string>
  time?: Record<string, string>
  versions?: Record<string, NpmPackageManifest>
  repository?: RepositoryField
}

export function fetchPackagePackument(
  packageName: string,
): Promise<NpmPackagePackument> {
  return pacote.packument(packageName, {
    fullMetadata: true,
  }) as Promise<NpmPackagePackument>
}
