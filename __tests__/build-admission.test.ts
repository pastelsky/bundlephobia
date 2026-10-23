import http from 'node:http'
import createServer from '../build-service/createServer.js'

function deferred<T>() {
  let resolve!: (value: T) => void

  const promise = new Promise<T>(done => {
    resolve = done
  })

  return { promise, resolve }
}

test('all analysis routes share a slot and release it after success or failure', async () => {
  const pending = deferred<{ size?: number }>()
  const started = deferred<void>()

  const analyze = jest
    .fn()
    .mockImplementationOnce(() => {
      started.resolve()

      return pending.promise
    })
    .mockResolvedValue({ size: 123 })

  const app = createServer({
    analyses: {
      size: analyze,
      exports: analyze,
      'exports-sizes': analyze,
    },
  })

  const log = jest.spyOn(console, 'error').mockImplementation(() => {})

  try {
    const first = app.inject('/size?p=first')
    await started.promise

    for (const route of ['size', 'exports', 'exports-sizes']) {
      const busy = await app.inject(`/${route}?p=second`)
      expect(busy.statusCode).toBe(503)
      expect(busy.headers['retry-after']).toBe('1')
      expect(busy.json().name).toBe('BuildServiceBusyError')
    }

    expect(analyze).toHaveBeenCalledTimes(1)
    pending.resolve({ size: 123 })
    expect((await first).statusCode).toBe(200)

    analyze.mockRejectedValueOnce(new Error('compiler failed'))
    expect((await app.inject('/exports?p=failed')).statusCode).toBe(500)
    expect((await app.inject('/exports-sizes?p=recovered')).statusCode).toBe(
      200,
    )
  } finally {
    pending.resolve({})
    await app.close()
    log.mockRestore()
  }
})

test('a disconnected HTTP caller cannot free a still-running build or its cleanup slot', async () => {
  const started = deferred<AbortSignal>()
  const aborted = deferred<void>()
  const compiler = deferred<void>()
  const cleanupStarted = deferred<void>()
  const cleanup = deferred<void>()
  const finished = deferred<void>()

  const app = createServer({
    analyses: {
      size: async (_package, { signal }) => {
        started.resolve(signal)
        signal.addEventListener('abort', () => aborted.resolve(), {
          once: true,
        })

        try {
          // A native compiler may finish only after the caller has gone away.
          await compiler.promise
        } finally {
          cleanupStarted.resolve()
          await cleanup.promise
          finished.resolve()
        }

        return { size: 123 }
      },
    },
  })

  let request: http.ClientRequest | undefined

  try {
    const address = await app.listen({ port: 0, host: '127.0.0.1' })
    request = http.get(`${address}/size?p=cancelled`)
    request.on('error', () => {})
    const signal = await started.promise
    const closed = new Promise<void>(resolve => request!.once('close', resolve))
    request.destroy()
    await closed
    await aborted.promise
    expect(signal.aborted).toBe(true)
    expect((await app.inject('/size?p=while-compiling')).statusCode).toBe(503)

    compiler.resolve()
    await cleanupStarted.promise
    expect((await app.inject('/size?p=while-cleaning')).statusCode).toBe(503)
    cleanup.resolve()
    await finished.promise
    await new Promise<void>(resolve => setImmediate(resolve))
    expect((await app.inject('/size?p=after-cleanup')).statusCode).toBe(200)
  } finally {
    request?.destroy()
    compiler.resolve()
    cleanup.resolve()
    await app.close()
  }
})
