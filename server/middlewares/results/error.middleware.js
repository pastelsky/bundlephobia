const arrayToSentence = require('array-to-sentence')
const { failureCache } = require('../../init')
const CONFIG = require('../../config')
const debug = require('debug')('bp:error')
const logger = require('../../Logger')

async function errorHandler(ctx, next) {
  const { force } = ctx.query

  const respondWithError = (status, { code, message = '', details = {} }) => {
    ctx.status = status
    ctx.body = {
      error: { code, message, details }
    }

    logger.error('BUILD_ERROR', {
      type: code,
      requestId: ctx.state.id,
      ...ctx.state.resolved,
      details,
    }, `${code} ${ctx.state.resolved.packageString}`)
  }

  try {
    await next()
  } catch (err) {
    console.error(err)
    ctx.cacheControl = {
      maxAge: force ? 0 : CONFIG.CACHE.SIZE_API_ERROR,
    }

    if (!'name' in err) {
      respondWithError(500, { code: 'UnkownError', details: err })
      return
    }

    switch (err.name) {
      case 'BlacklistedPackageError':
        respondWithError(403, {
          code: 'BlacklistedPackageError',
          message: 'The package you were looking for is blacklisted due to suspicious activity in the past',
        })
        break

      case 'PackageNotFoundError':
        respondWithError(404, {
          code: 'PackageNotFoundError',
          message: 'The package you were looking for doesn\'t exist.',
        })
        break

      case 'PackageVersionMismatchError': {
        const validVersions = arrayToSentence(
          err.extra
            .validVersions
            .map(version => `\`<code>${version}</code>\``),
        )

        respondWithError(404, {
          code: 'PackageVersionMismatchError',
          message: `This package has not been published with this particular version. 
                Valid versions - ${validVersions}`,
        })
        break
      }

      case 'InstallError':
        respondWithError(500, {
          code: 'InstallError',
          message: 'Installing the packaged failed.',
        })
        // Installing can fail for various reasons,
        // let's not cache this since it will
        // likely be resolved on a retry
        ctx.cacheControl = {
          maxAge: 0,
        }
        break

      case 'EntryPointError':
        respondWithError(500, {
          code: 'EntryPointError',
          message: 'We could not guess a valid entry point for this package. ' +
            'Perhaps the author hasn\'t specified one in its package.json ?',
        })
        break

      case 'MissingDependencyError': {
        const status = 500
        ctx.cacheControl = {
          maxAge: force ? 0 : CONFIG.CACHE.SIZE_API_ERROR_FATAL,
        }

        const missingModules = arrayToSentence(
          err.extra
            .missingModules
            .map(module => `\`<code>${module}</code>\``),
        )

        respondWithError(500, {
          code: 'MissingDependencyError',
          message: `This package (or this version) uses ${missingModules}, ` +
            `but does not specify ${missingModules.length > 1 ? 'them' :
              'it'} either as a dependency or a peer dependency`,
          details: err,
        })
        const body = {
          error: {
            code: 'MissingDependencyError',
            message: `This package (or this version) uses ${missingModules}, ` +
              `but does not specify ${missingModules.length > 1 ? 'them' :
                'it'} either as a dependency or a peer dependency`,
            details: err,
          },
        }

        ctx.status = status
        ctx.body = body

        debug('saved %s to failure cache', `${ctx.state.resolved.packageString}`)
        failureCache.set(
          `${ctx.state.packageString}`,
          { status, body },
        )
        break
      }

      case 'BuildError':
      default: {
        const status = 500
        const errorJSON = {
          code: 'BuildError',
          message: 'Failed to build this package.',
          details: err,
        }
        respondWithError(500, errorJSON)
        debug('saved %s to failure cache', `${ctx.state.resolved.packageString}`)
        failureCache.set(
          `${ctx.state.packageString}`,
          { status, body: { error: errorJSON } },
        )
        break
      }
    }
  }
}

module.exports = errorHandler