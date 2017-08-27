/**
 * Wraps the original error with a identifiable
 * name.
 */
module.exports = function CustomError(name, originalError) {
 Error.captureStackTrace(this, this.constructor)
 this.name = name
 this.originalError = originalError
}