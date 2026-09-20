import { JavaScriptPackageAnalysisAdapter } from './adapters/javascript-package-analysis.adapter'
import { PackageAnalysisGateway } from './analysis.gateway'

export const packageAnalysisGateway = new PackageAnalysisGateway()

packageAnalysisGateway.register(new JavaScriptPackageAnalysisAdapter())
