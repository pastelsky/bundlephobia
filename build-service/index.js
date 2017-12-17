const server = require('server');
require('now-logs')('bundlephobia:build');
const { get } = server.router;
const { json, status } = server.reply;

const getBuiltPackageStats = require('package-build-stats/getPackageStats')
const port = 7001

server({ port }, [
  get('/size', async ctx => {
    const packageString = decodeURIComponent(ctx.query.p)
    try {
      const result = await getBuiltPackageStats(packageString)
      return json(result)
    } catch (err) {
      console.log(err)
      return status(500).send(err)
    }
  })
]);

console.log('Bundlephobia: Build server running at port ' + port)
