import { formatLogMessage } from '../server/infrastructure/logger.service'

function fields<T>(metadata: T) {
  const line = formatLogMessage({
    level: '\u001b[31merror\u001b[39m',
    [Symbol.for('level')]: 'error',
    message: 'BUILD FAILED',
    metadata,
  })

  return JSON.parse(line.slice(line.indexOf('{')))
}

it('preserves native error causes and request attribution through the output formatter', () => {
  const cause = Object.assign(new Error('disk full'), { code: 'ENOSPC' })
  const error = new Error('install failed', { cause })
  expect(
    fields({
      error,
      tag: 'BUILD_ERROR',
      type: 'InstallError',
      requestId: 'request-1',
      packageString: 'react@19.2.0',
      time: 12,
    }),
  ).toMatchObject({
    tag: 'BUILD_ERROR',
    type: 'InstallError',
    time: 12,
    requestId: 'request-1',
    packageString: 'react@19.2.0',
    error: {
      name: 'Error',
      message: 'install failed',
      cause: { code: 'ENOSPC', message: 'disk full' },
    },
  })
  expect(fields(cause).error.code).toBe('ENOSPC')
})

it('keeps already formatted build details and serialized original errors', () => {
  expect(
    fields({
      name: 'InstallError',
      originalError: { code: 'ENOSPC', message: 'no space' },
      details: { originalError: 'installer failed' },
    }),
  ).toMatchObject({
    error: {
      name: 'InstallError',
      originalError: { code: 'ENOSPC', message: 'no space' },
    },
    details: { originalError: { message: 'installer failed' } },
  })
})

it('bounds cyclic errors and never serializes arbitrary request/configuration fields', () => {
  const error = Object.assign(new Error('x'.repeat(5000)), {
    code: 'EFAIL',
    headers: { authorization: 'secret-token' },
    config: { password: 'secret-password' },
  })

  Object.assign(error, { cause: error })
  const output = fields({ error, headers: { cookie: 'secret-cookie' } })
  expect(output.error.message).toHaveLength(4000)
  expect(output.error.cause.cause.cause).toBeUndefined()
  expect(JSON.stringify(output)).not.toContain('secret-')
})

it('does not duplicate ordinary info metadata as an error', () => {
  const line = formatLogMessage({
    level: 'info',
    message: 'CACHE HIT',
    metadata: { message: 'CACHE HIT', name: 'react', requestId: 'request-2' },
  })

  expect(line).not.toContain('"error"')
})

it('preserves bounded compiler error arrays without arbitrary fields', () => {
  const messages = Array.from(
    { length: 10 },
    (_, i) => `Cannot resolve file ${i}`,
  )

  const output = fields({
    error: { name: 'EntryPointError', originalError: messages },
  })

  expect(output.error.originalError.errors).toEqual(
    messages.slice(0, 5).map(message => ({ message })),
  )
  const cyclic: unknown[] = []
  cyclic.push(cyclic, {
    message: 'compile failed',
    headers: { authorization: 'secret' },
  })
  expect(JSON.stringify(fields({ error: cyclic }))).not.toContain('secret')
})
