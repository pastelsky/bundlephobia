import React from 'react'

export type PackageInfo = {
  name: string
  description: string
  repository: string
  dependencyCount: number
  isTreeShakeable: boolean
  hasSideEffects: string[] | boolean
}

export type Asset = {
  gzip: number
  name: string
  parse: any // TODO: fix type
  size: number
  type: string
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
