import React from 'react'

export type PackageInfo = {
  isTreeShakeable?: boolean

  assets: Asset[]
  dependencyCount: number
  dependencySizes: DependencySize[]
  description: string
  gzip: number
  hasJSModule: string
  hasJSNext: boolean
  hasSideEffects: string[] | boolean
  isModuleType: boolean
  name: string
  parse: any
  peerDependencies: string[]
  repository: string
  scoped: boolean
  size: number
  version: string
}

export type Asset = {
  gzip?: number
  name: string
  parse?: any // TODO: fix type
  size?: number
  type?: string
}

export type DependencySize = {
  approximateSize: number
  name: string
  isSelf?: boolean
  percentShare?: number
  sizeShare?: number
}

export type Tag = {
  tag: string
  weight: number
}

type Score = {
  detail: {
    maintenance: number
    popularity: number
    quality: number
  }
  final: number
}

type Maintainer = {
  email: string
  username: string
}

type Package = {
  author: {
    email: string
    name: string
    username: string
  }
  date: string
  description: string
  links: {
    bugs: string
    homepage: string
    npm: string
    repository: string
  }
  maintainers: Maintainer[]
  name: string
  publisher: Maintainer
  scope: string
  version: string
}

export type PackageSuggestion = {
  highlight: string
  package: Package
  score: Score
  searchScore: number
}
export type WithClassName = Pick<React.HTMLAttributes<HTMLElement>, 'className'>
