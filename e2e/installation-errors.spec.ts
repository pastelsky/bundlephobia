import { test, expect } from '@playwright/test'
import Fastify from 'fastify'
import { InstallError, UnsupportedPackageError } from 'package-build-stats'
import { createInstallationProvider } from '../build-service/installationProvider'
import sendInstallationError from '../installation-service/sendInstallationError'

for (const [error, status] of [
  [new UnsupportedPackageError('Unsupported platform'), 422],
  [new InstallError('connection timed out'), 500],
] as const) {
  test(`preserves ${error.name} through the installation HTTP boundary`, async () => {
    const app = Fastify()

    app.post('/installations', (_request, reply) =>
      sendInstallationError(error, reply),
    )

    try {
      const url = await app.listen({ host: '127.0.0.1', port: 0 })
      const response = await fetch(`${url}/installations`, { method: 'POST' })

      expect(response.status).toBe(status)

      const provider = createInstallationProvider(url)

      await expect(provider('example@1.0.0', {})).rejects.toMatchObject({
        name: error.name,
        originalError: error.originalError,
      })
    } finally {
      await app.close()
    }
  })
}
