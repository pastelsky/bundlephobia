import { languageRegistry } from '../../languages/registry'
import type {
  LanguageCapability,
  LanguageId,
  PackageReference,
} from '../../types/language-domain'
import type {
  PackageBuildResult,
  PackageExportSizesResult,
  PackageExportsResult,
} from '../types'
import type {
  AnalysisRequestOptions,
  PackageAnalysisAdapter,
  ResolvedAnalysisPackage,
} from './contracts'
import { PackageAnalysisGatewayError } from './errors'

export class PackageAnalysisGateway {
  private readonly adapters = new Map<LanguageId, PackageAnalysisAdapter>()

  register(adapter: PackageAnalysisAdapter): void {
    languageRegistry.get(adapter.language)
    if (
      adapter.storage.language !== adapter.language ||
      adapter.storage.namespace.language !== adapter.language
    ) {
      throw new Error(`Storage adapter language mismatch: ${adapter.language}`)
    }
    if (this.adapters.has(adapter.language)) {
      throw new Error(`Duplicate package analysis adapter: ${adapter.language}`)
    }
    this.adapters.set(adapter.language, adapter)
  }

  storageFor(language: LanguageId) {
    return this.adapterFor(language, 'analysis').storage
  }

  private adapterFor(
    language: LanguageId,
    capability: LanguageCapability
  ): PackageAnalysisAdapter {
    const descriptor = languageRegistry.get(language)
    if (descriptor.state !== 'enabled') {
      throw new PackageAnalysisGatewayError(
        'LanguageNotEnabled',
        language,
        capability
      )
    }
    if (!descriptor.capabilities.includes(capability)) {
      throw new PackageAnalysisGatewayError(
        'LanguageCapabilityNotSupported',
        language,
        capability
      )
    }
    const adapter = this.adapters.get(language)
    if (!adapter) {
      throw new PackageAnalysisGatewayError(
        'LanguageAdapterNotFound',
        language,
        capability
      )
    }
    return adapter
  }

  async resolvePackage(
    reference: PackageReference
  ): Promise<ResolvedAnalysisPackage> {
    return await this.adapterFor(reference.language, 'analysis').resolvePackage(
      reference
    )
  }

  isExactVersionSpecifier(reference: PackageReference): boolean {
    return this.adapterFor(
      reference.language,
      'analysis'
    ).isExactVersionSpecifier(reference.specifier)
  }

  analyzePackage(
    resolved: ResolvedAnalysisPackage,
    options: AnalysisRequestOptions
  ): Promise<PackageBuildResult> {
    const adapter = this.adapterFor(resolved.language, 'analysis')
    if (!adapter.analyzePackage) {
      throw new PackageAnalysisGatewayError(
        'LanguageAdapterNotFound',
        resolved.language,
        'analysis'
      )
    }
    return adapter.analyzePackage(resolved, options)
  }

  analyzePackageExports(
    resolved: ResolvedAnalysisPackage,
    options: AnalysisRequestOptions
  ): Promise<PackageExportsResult> {
    const adapter = this.adapterFor(resolved.language, 'exports')
    if (!adapter.analyzePackageExports) {
      throw new PackageAnalysisGatewayError(
        'LanguageAdapterNotFound',
        resolved.language,
        'exports'
      )
    }
    return adapter.analyzePackageExports(resolved, options)
  }

  analyzePackageExportSizes(
    resolved: ResolvedAnalysisPackage,
    options: AnalysisRequestOptions
  ): Promise<PackageExportSizesResult> {
    const adapter = this.adapterFor(resolved.language, 'export-sizes')
    if (!adapter.analyzePackageExportSizes) {
      throw new PackageAnalysisGatewayError(
        'LanguageAdapterNotFound',
        resolved.language,
        'export-sizes'
      )
    }
    return adapter.analyzePackageExportSizes(resolved, options)
  }
}
