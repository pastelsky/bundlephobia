const { resolvePackage } = require('../../../utils/server.utils')
const { parsePackageString } = require('../../../utils/common.utils')
const gitURLParse = require('git-url-parse')
const { debug, logger } = require('../../init')
const now = require('performance-now')

async function resolvePackageMiddleware(ctx, next) {
  const { package: packageString } = ctx.query
  const parsedPackage = parsePackageString(packageString)
  let resolvedPackage

  // prefill values in case resolution fails
  ctx.state.resolved = {
    ...parsedPackage,
    packageString: `${parsedPackage.name}@${parsedPackage.version}`,
  }

  const resolveStart = now()
  resolvedPackage = await resolvePackage(packageString)
  const resolveEnd = now()

  const { name, version, repository, description } = resolvedPackage
  let truncatedDescription = ''
  let repositoryURL = ''

  try {
    repositoryURL = gitURLParse(repository.url || repository).toString('https')
  } catch (e) {
    console.error('failed to parse repository url', repository)
  }

  if (description) {
    truncatedDescription =
      description.length > 300
        ? description.substring(0, 300) + '…'
        : description
  }

  const result = {
    name,
    version,
    scoped: parsedPackage.scoped,
    packageString: `${name}@${version}`,
    description: truncatedDescription,
    repository: repositoryURL,
  }

  ctx.state.resolved = result

  debug('resolved to %s@%s', name, version)
  const time = resolveEnd - resolveStart
  logger.info(
    'RESOLVE_PACKAGE',
    { ...result, time, requestId: ctx.state.id },
    `RESOLVED: ${result.packageString} in ${time.toFixed(0)}ms`
  )

  await next()
}

module.exports = resolvePackageMiddleware
