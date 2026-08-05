import DOMPurify from 'dompurify'

export interface ParsedPackageString {
  name: string
  version: string | null
  scope?: string
  scoped: boolean
}

// Used by the server as well as the client.
export function parsePackageString(packageString: string): ParsedPackageString {
  let name: string
  let version: string | null
  let scope: string | undefined
  let scoped = false
  const lastAtIndex = packageString.lastIndexOf('@')
  const firstSlashIndex = packageString.indexOf('/')

  if (packageString.startsWith('@')) {
    scoped = true
    scope = packageString.substring(1, firstSlashIndex)
    if (lastAtIndex === 0) {
      name = packageString
      version = null
    } else {
      name = packageString.substring(0, lastAtIndex)
      version = packageString.substring(lastAtIndex + 1)
    }
  } else if (lastAtIndex === -1) {
    name = packageString
    version = null
  } else {
    name = packageString.substring(0, lastAtIndex)
    version = packageString.substring(lastAtIndex + 1)
  }

  return { name, version, scope, scoped }
}

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
    const urlToParse =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`
    const parsed = new URL(urlToParse)

    if (parsed.hostname === 'github.com') {
      const parts = parsed.pathname.split('/').filter(Boolean)
      if (parts.length >= 2) {
        const owner = parts[0]
        const repo = parts[1].replace(/\.git$/, '')

        if (parts.length === 2) {
          return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/package.json`
        }

        if ((parts[2] === 'blob' || parts[2] === 'raw') && parts.length >= 4) {
          const branch = parts[3]
          const filePath = parts.slice(4).join('/') || 'package.json'
          return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
        }
      }
    }
    return urlToParse
  } catch {
    return trimmed
  }
}
