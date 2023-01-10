import { Asset } from '../types'

export type GetExportsSizeDto = {
  assets: Asset[]
  name: string
  version: string
}
