require('dotenv-defaults').config()
const fastify = require('fastify')()
const {
  getPackageStats,
  getAllPackageExports,
  getPackageExportSizes,
  eventQueue,
} = require('package-build-stats')
const Amplitude = require('@amplitude/node')

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

fastify.get('/size', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)
  try {
    const result = await getPackageStats(packageString, {
      installTimeout: 60000,
    })
    return res.code(200).send(result)
  } catch (err) {
    console.log(err)
    console.log('In build service I got', JSON.stringify(err, null, 2))
    return res.code(500).send(err)
  }
})

fastify.get('/exports-sizes', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)

  try {
    const result = await getPackageExportSizes(packageString, {
      installTimeout: 60000,
    })
    return res.code(200).send(result)
  } catch (err) {
    console.log(err)
    return res.code(500).send(err)
  }
})

fastify.get('/exports', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)

  try {
    const result = await getAllPackageExports(packageString, {
      installTimeout: 60000,
    })
    return res.code(200).send(result)
  } catch (err) {
    console.log(err)
    return res.code(500).send(err)
  }
})

fastify
  .listen(7002)
  .then(() => {
    console.log(`server listening on ${fastify.server.address().port}`)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
