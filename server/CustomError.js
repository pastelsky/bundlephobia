/**
 * Wraps the original error with a identifiable
 * name.
 */
// Use ES6 supported by Node v6.10 only!

module.exports = function CustomError(name, originalError, extra) {
  Error.captureStackTrace(this, this.constructor)
  this.name = name
  this.originalError = originalError
  this.extra = extra
}
