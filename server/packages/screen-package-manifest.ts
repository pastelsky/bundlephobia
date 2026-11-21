import { z } from 'zod'

import type { NpmPackageManifest } from '../clients/npm-registry.client'
import CustomError from '../custom-error'

export const MAX_UNPACKED_PACKAGE_BYTES = 150 * 1024 * 1024

const stringListSchema = z.array(z.string().min(1))

const binSchema = z.union([
  z.string().trim().min(1),
  z.record(z.string(), z.string()).refine(obj => Object.keys(obj).length > 0),
])

type PackageExportTarget =
  | string
  | null
  | PackageExportTarget[]
  | { [key: string]: PackageExportTarget }

const exportTargetSchema: z.ZodType<PackageExportTarget> = z.lazy(() =>
  z.union([
    z.string(),
    z.null(),
    z.array(exportTargetSchema),
    z.record(z.string(), exportTargetSchema),
  ]),
)

const exportTargetObjectSchema = z.record(z.string(), exportTargetSchema)

type ExportTargetObject = z.infer<typeof exportTargetObjectSchema>

const unpackedSizeSchema = z.number().finite().nonnegative()

/**
 * Evaluates npm's standard `os` / `cpu` constraint array against a target value.
 * Positive entries form an allowlist; `!value` entries form a blocklist.
 */
function matchesPlatformConstraint(
  constraints: readonly string[] | undefined,
  current: string,
): boolean {
  const parsed = stringListSchema.safeParse(constraints)

  if (!parsed.success || parsed.data.length === 0) return true

  const blocked = parsed.data
    .filter(entry => entry.startsWith('!'))
    .map(entry => entry.slice(1))

  if (blocked.includes(current)) return false

  const allowed = parsed.data.filter(entry => !entry.startsWith('!'))

  return allowed.length === 0 || allowed.includes(current)
}

function isTypesOnlyExportObject(target: ExportTargetObject): boolean {
  const keys = Object.keys(target)

  return (
    keys.length > 0 && keys.every(key => key === 'types' || key === 'typings')
  )
}

function screenPlatform(
  manifest: NpmPackageManifest,
  platform: string,
  arch: string,
): void {
  if (
    matchesPlatformConstraint(manifest.os, platform) &&
    matchesPlatformConstraint(manifest.cpu, arch)
  ) {
    return
  }

  throw new CustomError(
    'UnsupportedPackageError',
    { os: manifest.os, cpu: manifest.cpu },
    {
      reason: `This package does not support our build server (${platform}/${arch}).`,
    },
  )
}

function screenUnpackedSize(manifest: NpmPackageManifest): void {
  const parsedSize = unpackedSizeSchema.safeParse(manifest.dist?.unpackedSize)

  if (!parsedSize.success || parsedSize.data <= MAX_UNPACKED_PACKAGE_BYTES) {
    return
  }

  const sizeMb = Math.round(parsedSize.data / (1024 * 1024))

  throw new CustomError(
    'UnsupportedPackageError',
    { unpackedSize: parsedSize.data },
    {
      reason: `This package is too large to bundle (${sizeMb} MB unpacked; limit is 150 MB).`,
    },
  )
}

function screenSubpathExports(
  manifest: NpmPackageManifest,
  exportsMap: ExportTargetObject,
): void {
  if (!Object.hasOwn(exportsMap, '.')) {
    if (binSchema.safeParse(manifest.bin).success) {
      throw new CustomError(
        'CLIBuildError',
        `Package "${manifest.name}" does not export a root "." entry point.`,
        { bin: manifest.bin },
      )
    }

    throw new CustomError(
      'EntryPointError',
      `Package "${manifest.name}" does not export a root "." entry point in package.json "exports".`,
      undefined,
    )
  }

  const rootExport = exportTargetObjectSchema.safeParse(exportsMap['.'])

  if (rootExport.success && isTypesOnlyExportObject(rootExport.data)) {
    throw new CustomError(
      'EntryPointError',
      `Package "${manifest.name}" root "." export only provides TypeScript types.`,
      undefined,
    )
  }
}

function screenExports(manifest: NpmPackageManifest): void {
  const parsed = exportTargetObjectSchema.safeParse(manifest.exports)

  if (!parsed.success) return

  const keys = Object.keys(parsed.data)

  if (keys.length === 0) return

  if (keys.every(key => key.startsWith('.'))) {
    screenSubpathExports(manifest, parsed.data)

    return
  }

  if (isTypesOnlyExportObject(parsed.data)) {
    throw new CustomError(
      'EntryPointError',
      `Package "${manifest.name}" package.json "exports" only provides TypeScript types.`,
      undefined,
    )
  }
}

/**
 * Conservative, spec-guaranteed pre-install manifest screening.
 *
 * Only rejects releases guaranteed to fail installation or root entry resolution
 * under standard npm / Node Package Exports rules or extreme unpacked size caps,
 * avoiding full `bun` install + Rspack compilation work.
 */
export function screenPackageManifest(
  manifest: NpmPackageManifest,
  platform: string = process.platform,
  arch: string = process.arch,
): void {
  screenPlatform(manifest, platform, arch)
  screenUnpackedSize(manifest)
  screenExports(manifest)
}
