import type { FastifyReply } from 'fastify'

/** A completed response hands ownership to the worker; a disconnect does not. */
export default function requestSignal(reply: FastifyReply): AbortSignal {
  const controller = new AbortController()

  const cleanup = () => {
    reply.raw.off('close', disconnected)
    reply.raw.off('finish', cleanup)
  }

  const disconnected = () => {
    if (!reply.raw.writableFinished) controller.abort()
    cleanup()
  }

  reply.raw.once('close', disconnected)
  reply.raw.once('finish', cleanup)

  if (reply.raw.destroyed) disconnected()

  return controller.signal
}
