import React from 'react'

export type PackageInfo = {
  name: string
  description: string
  repository: string
  dependencyCount: number
  isTreeShakeable: boolean
  hasSideEffects: string[] | boolean
}

export type WithClassName = Pick<React.HTMLAttributes<HTMLElement>, 'className'>
