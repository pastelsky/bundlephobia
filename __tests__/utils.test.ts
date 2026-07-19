import { parsePackageString } from '../utils/common.utils'
import {
  createPackageApiPath,
  isPackageCacheMode,
} from '../utils/packageApi.utils'

describe('parsePackageString', () => {
  it('handles scoped packages correctly', () => {
    expect(parsePackageString('@babel/core@9.8.0')).toEqual({
      scoped: true,
      name: '@babel/core',
      version: '9.8.0',
      scope: 'babel',
    })
  })

  it('handles scoped packages without versions correctly', () => {
    expect(parsePackageString('@babel/core')).toEqual({
      scoped: true,
      name: '@babel/core',
      version: null,
      scope: 'babel',
    })
  })

  it('handles regular packages correctly', () => {
    expect(parsePackageString('react@15.6.1')).toEqual({
      scoped: false,
      name: 'react',
      version: '15.6.1',
      scope: undefined,
    })
  })

  it('handles regular packages without version correctly', () => {
    expect(parsePackageString('react')).toEqual({
      scoped: false,
      name: 'react',
      version: null,
      scope: undefined,
    })
  })

  it('handles special characters in name properly', () => {
    expect(parsePackageString('chart.js@5.6.0')).toEqual({
      scoped: false,
      name: 'chart.js',
      version: '5.6.0',
      scope: undefined,
    })
  })

  it('handles special characters in version properly', () => {
    expect(parsePackageString('chart.js@0.7.0-beta')).toEqual({
      scoped: false,
      name: 'chart.js',
      version: '0.7.0-beta',
      scope: undefined,
    })
  })
})

describe('package API request contract', () => {
  it('builds one encoded URL for package API callers', () => {
    expect(
      createPackageApiPath('size', '@scope/pkg@1.2.3', {
        cacheMode: 'force-rebuild',
        record: true,
      })
    ).toBe(
      '/api/size?package=%40scope%2Fpkg%401.2.3&cache=force-rebuild&record=true'
    )
  })

  it('accepts only the shared cache modes', () => {
    expect(isPackageCacheMode('cache-first')).toBe(true)
    expect(isPackageCacheMode('force-rebuild')).toBe(true)
    expect(isPackageCacheMode('cache-only')).toBe(true)
    expect(isPackageCacheMode('unknown')).toBe(false)
  })
})
