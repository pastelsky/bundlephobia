import { Asset, DependencySize } from '../types'

export type GetInfoDto = {
  assets: Asset[]
  dependencyCount: number
  dependencySizes: DependencySize[]
  description: string
  gzip: number
  hasJSModule: string
  hasJSNext: boolean
  hasSideEffects: boolean
  isModuleType: boolean
  name: string
  parse: null
  peerDependencies: string[]
  repository: string
  scoped: boolean
  size: number
  version: string
}
