import { parsePackageString } from '../utils/common.utils'

describe('parsePackageString', () => {
  it('handles scoped packages correctly', () => {
    expect(parsePackageString('@babel/core@9.8.0')).toEqual({
      scoped: true,
      name: '@babel/core',
      version: '9.8.0',
    })
  })

  it('handles scoped packages without versions correctly', () => {
    expect(parsePackageString('@babel/core')).toEqual({
      scoped: true,
      name: '@babel/core',
      version: null,
    })
  })

  it('handles regular packages correctly', () => {
    expect(parsePackageString('react@15.6.1')).toEqual({
      scoped: false,
      name: 'react',
      version: '15.6.1',
    })
  })

  it('handles regular packages without version correctly', () => {
    expect(parsePackageString('react')).toEqual({
      scoped: false,
      name: 'react',
      version: null,
    })
  })

  it('handles special characters in name properly', () => {
    expect(parsePackageString('chart.js@5.6.0')).toEqual({
      scoped: false,
      name: 'chart.js',
      version: '5.6.0',
    })
  })

  it('handles special characters in version properly', () => {
    expect(parsePackageString('chart.js@0.7.0-beta')).toEqual({
      scoped: false,
      name: 'chart.js',
      version: '0.7.0-beta',
    })
  })
})
