// Used by the server as well as the client
// Use ES5 only

const DOMPurify = require('dompurify')

function parsePackageString(packageString) {
  // Scoped packages
  let name,
    version,
    scope,
    scoped = false
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
  } else {
    if (lastAtIndex === -1) {
      name = packageString
      version = null
    } else {
      name = packageString.substring(0, lastAtIndex)
      version = packageString.substring(lastAtIndex + 1)
    }
  }

  return { name, version, scope, scoped }
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

/**
 * replace it when refactor to TS
 * @param {string} str - input string
 * @returns boolean
 * */
function isEmpty(str) {
  return !str.trim().length
}

module.exports = { parsePackageString, daysFromToday, sanitizeHTML, isEmpty }
