import type { LanguageId, PackageReference } from '../types/language-domain'
import { createJavaScriptPackageReference } from './javascript'
import { languageRegistry } from './registry'

export type PackageRouteKind = 'legacy-javascript' | 'language-explicit'

export interface ParsedPackagePageRoute {
  kind: PackageRouteKind
  reference: PackageReference
}

type PackageRouteValue = string | readonly string[] | undefined

function routeSegments(value: PackageRouteValue): string[] {
  if (value === undefined) return []
  return typeof value === 'string' ? value.split('/') : [...value]
}

export function parsePackagePageRoute(
  value: PackageRouteValue
): ParsedPackagePageRoute | null {
  const segments = routeSegments(value)
  if (segments.length === 0) return null

  const [possibleLanguage, ...specifierSegments] = segments
  if (
    specifierSegments.length > 0 &&
    languageRegistry.isLanguageId(possibleLanguage)
  ) {
    return {
      kind: 'language-explicit',
      reference: {
        language: possibleLanguage,
        specifier: specifierSegments.join('/'),
      },
    }
  }

  return {
    kind: 'legacy-javascript',
    reference: createJavaScriptPackageReference(segments.join('/')),
  }
}

export function getPackagePagePath(reference: PackageReference): string {
  if (reference.language === 'javascript') {
    return `/package/${reference.specifier}`
  }

  return `/package/${reference.language}/${reference.specifier}`
}

export function getExplicitPackagePagePath(
  language: LanguageId,
  specifier: string
): string {
  return `/package/${language}/${specifier}`
}
