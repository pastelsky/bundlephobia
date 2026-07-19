import type { Middleware } from 'koa'
import now from 'performance-now'
import createDebug from 'debug'

import { formatSentence } from '../../../utils/common.utils'
import config from '../../config'
import { failureCache } from '../../init'
import logger from '../../Logger'
import { errorCacheMaxAge } from './packageCache'
import type { PackageRequest, ResolvedPackage } from '../../types'

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

type PackageErrorContext = Omit<PackageRequest, 'cacheMode'> | ResolvedPackage

// Converts package workflow failures into stable API errors and cache policy.
// Logs either requested or resolved package context without invented metadata.
const errorHandler: Middleware = async (ctx, next) => {
  const { cacheMode, ...requestedPackage } = ctx.state.packageRequest
  const start = now()

  const getPackageContext = (): PackageErrorContext =>
    ctx.state.resolvedPackage ?? requestedPackage

  const respondWithError = (
    status: number,
    {
      code,
      message,
      details,
    }: {
      code: string
      message: string
      details?: unknown
    }
  ) => {
    const packageContext = getPackageContext()
    ctx.status = status
    ctx.body = {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    } satisfies ErrorResponseBody

    logger.error(
      'BUILD_ERROR',
      {
        type: code,
        requestId: ctx.state.id,
        time: now() - start,
        ...packageContext,
        ...(details === undefined ? {} : { details }),
      },
      `${code} ${packageContext.packageString}`
    )
  }

  try {
    await next()
  } catch (error) {
    console.error(error)
    ctx.cacheControl = {
      maxAge: errorCacheMaxAge(cacheMode, config.CACHE.SIZE_API_ERROR),
    }

    if (!(error instanceof Error)) {
      const errObj = error as Record<string, unknown> | null
      if (errObj && errObj.code === 'JOB_EXPIRED') {
        ctx.cacheControl = { maxAge: 0 }
        respondWithError(503, {
          code: 'QueueTimeoutError',
          message:
            'The build queue is currently full and this request timed out. ' +
            'Please try again in a few minutes.',
        })
        return
      }
      if (errObj && errObj.code === 'QUEUE_CLEARED') {
        ctx.cacheControl = { maxAge: 0 }
        respondWithError(503, {
          code: 'QueueClearedError',
          message:
            'The build queue was cleared. Please try building the package again.',
        })
        return
      }

      respondWithError(500, {
        code: 'UnknownError',
        message: 'An unexpected error occurred while building this package.',
        details: error,
      })
      return
    }

    const err = error as BuildErrorShape
    const packageString = getPackageContext().packageString

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
          maxAge: errorCacheMaxAge(
            cacheMode,
            config.CACHE.SIZE_API_ERROR_UNSUPPORTED
          ),
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
          message: validVersions
            ? `This package has not been published with this particular version. Valid versions - ${validVersions}`
            : 'This package has not been published with this particular version.',
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
        const status = 422
        const body = {
          error: {
            code: 'EntryPointError',
            message:
              'We could not guess a valid entry point for this package. ' +
              "Perhaps the author hasn't specified one in its package.json ?",
          },
        }

        ctx.cacheControl = {
          maxAge: errorCacheMaxAge(
            cacheMode,
            config.CACHE.SIZE_API_ERROR_FATAL
          ),
        }

        respondWithError(status, body.error)
        debug('saved %s to failure cache', packageString)
        failureCache.set(packageString, { status, body })
        break
      }

      case 'MissingDependencyError': {
        const status = 422
        const missingModulesList = err.extra?.missingModules ?? []
        const missingModules = formatSentence(
          missingModulesList.map(module => `\`<code>${module}</code>\``)
        )
        const body = {
          error: {
            code: 'MissingDependencyError',
            message:
              `This package (or this version) uses ${
                missingModules ?? 'one or more missing modules'
              }, ` +
              `but does not specify ${
                missingModulesList.length > 1 ? 'them' : 'it'
              } either as a dependency or a peer dependency`,
            details: err,
          },
        }

        ctx.cacheControl = {
          maxAge: errorCacheMaxAge(
            cacheMode,
            config.CACHE.SIZE_API_ERROR_FATAL
          ),
        }

        respondWithError(status, body.error)
        debug('saved %s to failure cache', packageString)
        failureCache.set(packageString, { status, body })
        break
      }

      case 'MinifyError': {
        const status = 422
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
          maxAge: errorCacheMaxAge(
            cacheMode,
            config.CACHE.SIZE_API_ERROR_FATAL
          ),
        }

        respondWithError(status, body.error)
        debug('saved %s to failure cache', packageString)
        failureCache.set(packageString, { status, body })
        break
      }

      case 'BuildError':
      default: {
        const status = 422
        const errorJSON = {
          code: 'BuildError',
          message: 'Failed to build this package.',
          details: err,
        }
        respondWithError(status, errorJSON)
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
