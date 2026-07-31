import { parsePackageString } from '../utils/common.utils'
import { resolveBuildError } from '../utils'

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

describe('resolveBuildError', () => {
  const resolveDetails = (originalError: unknown) =>
    resolveBuildError({
      error: {
        code: 'BuildError',
        message: 'Failed to build this package.',
        details: { originalError },
      },
    }).errorDetails

  it('preserves string details', () => {
    expect(resolveDetails('plain failure')).toBe('plain failure')
  })

  it('preserves every array entry', () => {
    expect(resolveDetails(['first failure', 'second failure'])).toBe(
      'first failure\n\nsecond failure'
    )
  })

  it('pretty-prints object details', () => {
    expect(
      resolveDetails({
        reason: 'BUILD_SERVICE_UNREACHABLE',
        retryable: true,
      })
    ).toBe(
      JSON.stringify(
        {
          reason: 'BUILD_SERVICE_UNREACHABLE',
          retryable: true,
        },
        null,
        2
      )
    )
  })

  it('uses an Error message without exposing its stack', () => {
    expect(resolveDetails(new Error('safe failure message'))).toBe(
      'safe failure message'
    )
  })

  it.each([null, undefined, '', '   ', []])(
    'omits empty details: %p',
    value => {
      expect(resolveDetails(value)).toBeNull()
    }
  )

  it('handles circular error details', () => {
    const circular: { self?: unknown } = {}
    circular.self = circular

    expect(resolveDetails(circular)).toContain('[Circular]')
  })
})
