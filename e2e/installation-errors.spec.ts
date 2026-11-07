import { test, expect } from '@playwright/test'
import Fastify from 'fastify'
import {
  InstallError,
  UnsupportedPackageError,
  getPackageStats,
  eventQueue,
} from 'package-build-stats'
import { createInstallationProvider } from '../build-service/installationProvider'
import sendInstallationError from '../installation-service/sendInstallationError'

for (const [error, status] of [
  [
    new UnsupportedPackageError(
      'skipped @esbuild/android-arm@0.28.2 (unsupported platform)',
      {
        reason:
          'The requested package does not support our build server (linux/x64).',
      },
    ),
    422,
  ],
  [new InstallError('connection timed out'), 500],
] as const) {
  test(`preserves ${error.name} through the installation HTTP boundary`, async () => {
    const app = Fastify()
    const completions: unknown[] = []
    const record = (details: unknown) => completions.push(details)

    eventQueue.on('TASK_PACKAGE_STATS', record)

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

      if (error.extra) {
        await expect(provider('example@1.0.0', {})).rejects.toMatchObject({
          extra: error.extra,
        })
      }
      await expect(
        getPackageStats('example@1.0.0', { installationProvider: provider }),
      ).rejects.toMatchObject({ name: error.name })
      // The existing build-failure counter labels terminal events by error.name.
      expect(completions).toContainEqual(
        expect.objectContaining({
          isSuccessful: false,
          error: expect.objectContaining({ name: error.name }),
        }),
      )
    } finally {
      eventQueue.off('TASK_PACKAGE_STATS', record)
      await app.close()
    }
  })
}
