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
}

export type Tag = {
  tag: string
  weight: number
}
export type WithClassName = Pick<React.HTMLAttributes<HTMLElement>, 'className'>
