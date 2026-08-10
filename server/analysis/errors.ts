import type {
  LanguageCapability,
  LanguageId,
} from '../../types/language-domain'

export type PackageAnalysisGatewayErrorCode =
  | 'LanguageNotEnabled'
  | 'LanguageAdapterNotFound'
  | 'LanguageCapabilityNotSupported'

export class PackageAnalysisGatewayError extends Error {
  constructor(
    readonly code: PackageAnalysisGatewayErrorCode,
    readonly language: LanguageId,
    readonly capability: LanguageCapability,
    options?: ErrorOptions,
  ) {
    super(code, options)
    this.name = 'PackageAnalysisGatewayError'
  }
}
