// Used by the server as well as the client
// Use ES5 only

const DOMPurify = require('dompurify')

function parsePackageString(packageString) {
  // Scoped packages
  let name,
    version,
    path,
    scope,
    scoped = false
  const lastAtIndex = packageString.lastIndexOf('@')
  const firstSlashIndex = packageString.indexOf('/')

  if (packageString.startsWith('@')) {
    const secondSlashIndex = packageString.indexOf('/', firstSlashIndex + 1)

    scoped = true
    scope = packageString.substring(1, firstSlashIndex)

    name =
      lastAtIndex === 0
        ? secondSlashIndex === -1
          ? packageString
          : packageString.substring(0, secondSlashIndex)
        : packageString.substring(0, lastAtIndex)
    version =
      lastAtIndex === 0
        ? null
        : secondSlashIndex === -1
        ? packageString.substring(lastAtIndex + 1)
        : packageString.substring(lastAtIndex + 1, secondSlashIndex)
    path =
      secondSlashIndex === -1
        ? null
        : packageString.substring(secondSlashIndex + 1)
  } else {
    name =
      lastAtIndex === -1
        ? firstSlashIndex === -1
          ? packageString
          : packageString.substring(0, firstSlashIndex)
        : packageString.substring(0, lastAtIndex)
    version =
      lastAtIndex === -1
        ? null
        : firstSlashIndex === -1
        ? packageString.substring(lastAtIndex + 1)
        : packageString.substring(lastAtIndex + 1, firstSlashIndex)
    path =
      firstSlashIndex === -1
        ? null
        : packageString.substring(firstSlashIndex + 1)
  }

  const normalPath = name + (version ? '@' + version : '')
  const fullPath = normalPath + (path ? '/' + path : '')

  return { name, version, path, scope, scoped, normalPath, fullPath }
}

function daysFromToday(date) {
  const date1 = new Date()
  const date2 = new Date(date)
  const diffTime = Math.abs(date2 - date1)
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

function sanitizeHTML(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'div'],
    ALLOWED_ATTR: [''],
  })
}

module.exports = { parsePackageString, daysFromToday, sanitizeHTML }
