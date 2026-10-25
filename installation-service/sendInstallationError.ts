import type { FastifyReply } from 'fastify'
import { z } from 'zod'
import { UnsupportedRegistryPackageSpecError } from './resolveRegistryPackageSpec.ts'
import serializeError from '../build-service/serializeError.js'

export default function sendInstallationError(
  error: Error,
  reply: FastifyReply,
) {
  if (
    error instanceof UnsupportedRegistryPackageSpecError ||
    error instanceof z.ZodError
  ) {
    return reply.code(400).send({
      name: 'InstallError',
      originalError: error.message,
    })
  }

  const serialized = serializeError(error)

  const code = 'code' in error ? error.code : undefined

  const packageNotFound =
    serialized.name === 'PackageNotFoundError' ||
    code === 'E404' ||
    code === 'ETARGET'

  if (packageNotFound) {
    serialized.name = 'PackageNotFoundError'

    return reply.code(404).send(serialized)
  }

  return reply
    .code(serialized.name === 'UnsupportedPackageError' ? 422 : 500)
    .send(serialized)
}
