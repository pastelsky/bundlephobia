import type { Middleware } from 'koa'
import now from 'performance-now'
import createDebug from 'debug'

import config from '../../config'
import { failureCache } from '../../init'
import logger from '../../Logger'

const debug = createDebug('bp:error')

interface ErrorResponseBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

interface BuildErrorShape extends Error {
  originalError?: unknown
  extra?: {
    reason?: string
    validVersions?: string[]
    missingModules?: string[]
    filePath?: string
  }
}

function formatSentence(values: string[]): string {
  if (values.length === 0) {
    return ''
  }
  if (values.length === 1) {
    return values[0]
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`
  }
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

const errorHandler: Middleware = async (ctx, next) => {
  const { force } = ctx.query
  const start = now()

  const respondWithError = (
    status: number,
    {
      code,
      message = '',
      details = {},
    }: {
      code: string
      message?: string
      details?: unknown
    }
  ) => {
    ctx.status = status
    ctx.body = {
      error: { code, message, details },
    } satisfies ErrorResponseBody

    logger.error(
      'BUILD_ERROR',
      {
        type: code,
        requestId: ctx.state.id,
        time: now() - start,
        ...ctx.state.resolved,
        details,
      },
      `${code} ${ctx.state.resolved.packageString}`
    )
  }

  try {
    await next()
  } catch (error) {
    console.error(error)
    ctx.cacheControl = {
      maxAge: force ? 0 : config.CACHE.SIZE_API_ERROR,
    }

    if (!(error instanceof Error)) {
      respondWithError(500, { code: 'UnknownError', details: error })
      return
    }

    const err = error as BuildErrorShape
    const packageString = ctx.state.resolved.packageString

    switch (err.name) {
      case 'BlocklistedPackageError':
        respondWithError(403, {
          code: 'BlocklistedPackageError',
          message:
            'The package you were looking for is blocklisted ' +
            "because it failed to build multiple times in the past and further tries aren't likely to succeed. This can " +
            "happen if this package wasn't meant to be bundled in a client side application.",
        })
        break

      case 'UnsupportedPackageError':
        ctx.cacheControl = {
          maxAge: force ? 0 : config.CACHE.SIZE_API_ERROR_UNSUPPORTED,
        }
        respondWithError(403, {
          code: 'UnsupportedPackageError',
          message: `The package you were looking for is unsupported and cannot be built by bundlephobia — ${
            err.extra?.reason ?? 'unknown reason'
          }`,
        })
        break

      case 'PackageNotFoundError':
        respondWithError(404, {
          code: 'PackageNotFoundError',
          message: "The package you were looking for doesn't exist.",
        })
        break

      case 'PackageVersionMismatchError': {
        const validVersions = formatSentence(
          (err.extra?.validVersions ?? []).map(
            version => `\`<code>${version}</code>\``
          )
        )

        respondWithError(404, {
          code: 'PackageVersionMismatchError',
          message: `This package has not been published with this particular version. Valid versions - ${validVersions}`,
        })
        break
      }

      case 'InstallError':
        respondWithError(500, {
          code: 'InstallError',
          message: 'Installing the package failed.',
        })
        ctx.cacheControl = {
          maxAge: 0,
        }
        break

      case 'EntryPointError': {
        const status = 500
        const body = {
          error: {
            code: 'EntryPointError',
            message:
              'We could not guess a valid entry point for this package. ' +
              "Perhaps the author hasn't specified one in its package.json ?",
          },
        }

        ctx.cacheControl = {
          maxAge: force ? 0 : config.CACHE.SIZE_API_ERROR_FATAL,
        }

        respondWithError(status, body.error)
        debug('saved %s to failure cache', packageString)
        failureCache.set(packageString, { status, body })
        break
      }

      case 'MissingDependencyError': {
        const status = 500
        const missingModulesList = err.extra?.missingModules ?? []
        const missingModules = formatSentence(
          missingModulesList.map(module => `\`<code>${module}</code>\``)
        )
        const body = {
          error: {
            code: 'MissingDependencyError',
            message:
              `This package (or this version) uses ${missingModules}, ` +
              `but does not specify ${
                missingModulesList.length > 1 ? 'them' : 'it'
              } either as a dependency or a peer dependency`,
            details: err,
          },
        }

        ctx.cacheControl = {
          maxAge: force ? 0 : config.CACHE.SIZE_API_ERROR_FATAL,
        }

        respondWithError(status, body.error)
        debug('saved %s to failure cache', packageString)
        failureCache.set(packageString, { status, body })
        break
      }

      case 'MinifyError': {
        const status = 500
        const body = {
          error: {
            code: 'MinifyError',
            message:
              'We could not minify one of the source files in this package or its dependencies. ' +
              `Please verify if the contents of <code>${
                err.extra?.filePath ?? 'unknown file'
              }</code> can be minified using <a href="https://try.terser.org/" target="_blank">terser</a>.`,
            details: {
              originalError: JSON.stringify(err.originalError, null, 2),
            },
          },
        }

        ctx.cacheControl = {
          maxAge: force ? 0 : config.CACHE.SIZE_API_ERROR_FATAL,
        }

        respondWithError(status, body.error)
        debug('saved %s to failure cache', packageString)
        failureCache.set(packageString, { status, body })
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
        debug('saved %s to failure cache', packageString)
        failureCache.set(packageString, {
          status,
          body: { error: errorJSON },
        })
        break
      }
    }
  }
}

export default errorHandler
