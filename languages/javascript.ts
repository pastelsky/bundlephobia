import type { PackageReference } from '../types/language-domain'

export interface ParsedJavaScriptPackageSpecifier {
  name: string
  version: string | null
  scope?: string
  scoped: boolean
}

/** Parse npm's name, scoped-name, and optional version syntax. */
export function parseJavaScriptPackageSpecifier(
  packageSpecifier: string,
): ParsedJavaScriptPackageSpecifier {
  let name: string
  let version: string | null
  let scope: string | undefined
  let scoped = false
  const lastAtIndex = packageSpecifier.lastIndexOf('@')
  const firstSlashIndex = packageSpecifier.indexOf('/')

  if (packageSpecifier.startsWith('@')) {
    scoped = true
    scope = packageSpecifier.substring(1, firstSlashIndex)
    if (lastAtIndex === 0) {
      name = packageSpecifier
      version = null
    } else {
      name = packageSpecifier.substring(0, lastAtIndex)
      version = packageSpecifier.substring(lastAtIndex + 1)
    }
  } else if (lastAtIndex === -1) {
    name = packageSpecifier
    version = null
  } else {
    name = packageSpecifier.substring(0, lastAtIndex)
    version = packageSpecifier.substring(lastAtIndex + 1)
  }

  return { name, version, scope, scoped }
}

export function formatJavaScriptPackageSpecifier(
  parsed: Pick<ParsedJavaScriptPackageSpecifier, 'name' | 'version'>,
): string {
  return parsed.version === null
    ? parsed.name
    : `${parsed.name}@${parsed.version}`
}

export function createJavaScriptPackageReference(
  specifier: string,
): PackageReference {
  return { language: 'javascript', specifier }
}
