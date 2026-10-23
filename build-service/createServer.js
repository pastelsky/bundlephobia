import Fastify from 'fastify'
import serializeError from './serializeError.js'

export default function createServer({ analyses, installationProvider }) {
  const fastify = Fastify()
  let activeBuilds = 0

  for (const [operation, analyze] of Object.entries(analyses)) {
    fastify.get(`/${operation}`, async (req, res) => {
      // PM2 runs three workers. Each owns one slot through build AND cleanup,
      // even when an aborted HTTP caller has already released its main queue slot.
      if (activeBuilds >= 1) {
        return res
          .code(503)
          .header('Retry-After', '1')
          .send({
            name: 'BuildServiceBusyError',
            originalError: 'This build worker is busy',
            extra: { retryable: true },
          })
      }

      activeBuilds += 1
      const controller = new AbortController()
      const abort = () => controller.abort()
      const timeout = setTimeout(abort, 10 * 60_000)
      req.raw.once('aborted', abort)
      res.raw.once('close', abort)
      let packageString

      try {
        if (req.raw.aborted || res.raw.destroyed) abort()
        controller.signal.throwIfAborted()
        packageString = decodeURIComponent(req.query.p)

        const result = await analyze(packageString, {
          installTimeout: 60000,
          installationProvider,
          signal: controller.signal,
        })

        return res.code(200).send(result)
      } catch (error) {
        const serialized = serializeError(error)
        console.error('PACKAGE_BUILD_FAILED', {
          packageString,
          name: serialized.name,
          originalError: serialized.originalError,
        })

        return res.code(500).send(serialized)
      } finally {
        clearTimeout(timeout)
        req.raw.off('aborted', abort)
        res.raw.off('close', abort)
        activeBuilds -= 1
      }
    })
  }

  return fastify
}
