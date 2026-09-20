import CustomError from '../../errors/custom.error'
import { PackageAnalysisGatewayError } from '../analysis.error'

/**
 * Keeps legacy JavaScript routes decoupled from gateway-native errors. Existing
 * JavaScript build errors pass through unchanged so their status/body mapping
 * remains owned by the legacy error middleware.
 */
export function toLegacyJavaScriptError<T>(error: T): Error | T {
  if (!(error instanceof PackageAnalysisGatewayError)) return error

  switch (error.code) {
    case 'LanguageNotEnabled':
      return new CustomError('UnsupportedPackageError', error, {
        reason: `language ${error.language} is not enabled`,
      })
    case 'LanguageCapabilityNotSupported':
      return new CustomError('UnsupportedPackageError', error, {
        reason: `${error.capability} is not supported for ${error.language}`,
      })
    case 'LanguageAdapterNotFound':
    default:
      return new CustomError('BuildServiceError', error, undefined)
  }
}
