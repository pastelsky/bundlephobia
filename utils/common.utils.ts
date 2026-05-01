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
