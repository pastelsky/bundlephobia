import type {
  LanguageCapability,
  LanguageId,
} from '../../types/language-domain'

export type PackageAnalysisGatewayErrorCode =
  | 'LanguageNotEnabled'
  | 'LanguageAdapterNotFound'
  | 'LanguageCapabilityNotSupported'

export class PackageAnalysisGatewayError extends Error {
  readonly code: PackageAnalysisGatewayErrorCode
  readonly language: LanguageId
  readonly capability: LanguageCapability

  constructor(options: {
    code: PackageAnalysisGatewayErrorCode
    language: LanguageId
    capability: LanguageCapability
    cause?: ErrorOptions['cause']
  }) {
    super(options.code, { cause: options.cause })
    this.code = options.code
    this.language = options.language
    this.capability = options.capability
    this.name = 'PackageAnalysisGatewayError'
  }
}
