import 'dotenv-defaults/config.js'
import {
  getPackageStats,
  getPackageExportSizes,
  getAllPackageExports as getPackageExports,
  eventQueue,
} from 'package-build-stats'
import Amplitude from '@amplitude/node'
import createServer from './createServer.js'
import { createInstallationProvider } from './installationProvider.ts'

const installationProvider = process.env.INSTALLATION_SERVICE_ENDPOINT
  ? createInstallationProvider(process.env.INSTALLATION_SERVICE_ENDPOINT)
  : undefined

if (process.env.AMPLITUDE_API_KEY) {
  const client = Amplitude.init(process.env.AMPLITUDE_API_KEY)

  eventQueue.on('*', (event, details) => {
    client.logEvent({
      event_type: event,
      user_id: 'build-service',
      event_properties: {
        ...details,
      },
    })
  })

  setInterval(() => {
    client.flush()
  }, 5000)
}

const fastify = createServer({
  installationProvider,
  analyses: {
    size: getPackageStats,
    'exports-sizes': getPackageExportSizes,
    exports: getPackageExports,
  },
})

fastify
  .listen({ port: 7002 })
  .then(() => {
    console.log(`server listening on ${fastify.server.address().port}`)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
