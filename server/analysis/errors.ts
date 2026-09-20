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

  constructor(
    ...args: [
      code: PackageAnalysisGatewayErrorCode,
      language: LanguageId,
      capability: LanguageCapability,
      options?: ErrorOptions,
    ]
  ) {
    super(args[0], args[3])
    this.code = args[0]
    this.language = args[1]
    this.capability = args[2]
    this.name = 'PackageAnalysisGatewayError'
  }
}
