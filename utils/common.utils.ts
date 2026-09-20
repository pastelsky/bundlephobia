import DOMPurify from 'dompurify'
import {
  parseJavaScriptPackageSpecifier,
  type ParsedJavaScriptPackageSpecifier,
} from '../languages/javascript'

/**
 * @deprecated JavaScript-only compatibility alias. New language-aware code
 * should import the adapter-specific parser directly.
 */
export type ParsedPackageString = ParsedJavaScriptPackageSpecifier

export const parsePackageString = parseJavaScriptPackageSpecifier

export function daysFromToday(date: string | number | Date): number {
  const date1 = new Date()
  const date2 = new Date(date)
  const diffTime = Math.abs(date2.getTime() - date1.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  return diffDays
}

export function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'div'],
    ALLOWED_ATTR: [''],
  })
}

/** Keep the API's small error-message formatting without trusting its data. */
export function sanitizeErrorHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['a', 'b', 'code', 'i'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  })
}

export function normalizePackageJsonUrl(inputUrl: string): string {
  const trimmed = inputUrl.trim()

  if (!trimmed) return ''

  try {
    const url = withHttpScheme(trimmed)

    return normalizeParsedPackageUrl(new URL(url), url)
  } catch {
    return trimmed
  }
}

function withHttpScheme(url: string): string {
  return url.startsWith('http://') || url.startsWith('https://')
    ? url
    : `https://${url}`
}

function normalizeParsedPackageUrl(url: URL, original: string): string {
  if (url.hostname !== 'github.com') return original

  const parts = url.pathname.split('/').filter(Boolean)

  if (parts.length < 2) return original

  const owner = parts[0]
  const repo = parts[1].replace(/\.git$/, '')

  if (parts.length === 2) {
    return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/package.json`
  }

  if (parts[2] !== 'blob' && parts[2] !== 'raw') return original

  if (parts.length < 4) return original

  const branch = parts[3]
  const filePath = parts.slice(4).join('/') || 'package.json'

  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
}
