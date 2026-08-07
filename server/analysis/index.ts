import { JavaScriptPackageAnalysisAdapter } from './javascript/JavaScriptPackageAnalysisAdapter'
import { PackageAnalysisGateway } from './PackageAnalysisGateway'

export const packageAnalysisGateway = new PackageAnalysisGateway()
packageAnalysisGateway.register(new JavaScriptPackageAnalysisAdapter())

export * from './contracts'
export * from './context.middleware'
export * from './errors'
export * from './keys'
export { PackageAnalysisGateway }
