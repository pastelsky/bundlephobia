const fastify = require('fastify')()
const getBuiltPackageStats = require('package-build-stats')
const {
  getAllPackageExports,
  getPackageExportSizes,
} = require('package-build-stats/src/getPackageExportSizes')

fastify.get('/size', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)
  try {
    const result = await getBuiltPackageStats(packageString)
    return res.code(200).send(result)
  } catch (err) {
    console.log(err)
    return res.code(500).send(err)
  }
})

fastify.get('/exports-sizes', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)

  try {
    const result = await getPackageExportSizes(packageString)
    return res.code(200).send(result)
  } catch (err) {
    console.log(err)
    return res.code(500).send(err)
  }
})

fastify.get('/exports', async (req, res) => {
  const packageString = decodeURIComponent(req.query.p)

  try {
    const result = await getAllPackageExports(packageString)
    return res.code(200).send(result)
  } catch (err) {
    console.log(err)
    return res.code(500).send(err)
  }
})

fastify.listen(7002, '127.0.0.1', function (err) {
  if (err) throw err
  console.log(`server listening on ${fastify.server.address().port}`)
})
