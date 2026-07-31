import type { Middleware } from 'koa'
import now from 'performance-now'
import createDebug from 'debug'

import { toErrorDetail } from '../../../utils'
import config from '../../config'
import { failureCache } from '../../init'
import logger from '../../Logger'
import { isJobCancelledError } from '../../Queue'

const debug = createDebug('bp:error')
const MAX_ERROR_LIST_ITEMS = 20

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
    suggestedVersion?: string
    missingModules?: string[]
    filePath?: string
  }
}

interface ClientHttpError extends Error {
  status: number
}

function isClientHttpError(error: Error): error is ClientHttpError {
  if (!('status' in error) || typeof error.status !== 'number') {
    return false
  }
  return (
    Number.isInteger(error.status) && error.status >= 400 && error.status < 500
  )
}

function formatSentence(values: string[]): string {
  const omittedCount = values.length - MAX_ERROR_LIST_ITEMS
  values = values.slice(0, MAX_ERROR_LIST_ITEMS)
  if (omittedCount > 0) {
    values.push(`${omittedCount} more`)
  }

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

function getErrorDetails(originalError: unknown) {
  const detail = toErrorDetail(originalError)
  return detail ? { originalError: detail } : undefined
}

const errorHandler: Middleware = async (ctx, next) => {
  const { force } = ctx.query
  const start = now()
  let packageString = ctx.state.resolved?.packageString

  const cacheFailure = (status: number, body: unknown) => {
    if (!packageString) {
      return
    }
    debug('saved %s to failure cache', packageString)
    failureCache.set(packageString, { status, body })
  }

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
      packageString ? `${code} ${packageString}` : code
    )
  }

  try {
    await next()
  } catch (error) {
    packageString = ctx.state.resolved?.packageString
    ctx.cacheControl = {
      maxAge: force ? 0 : config.CACHE.SIZE_API_ERROR,
    }

    if (isJobCancelledError(error)) {
      ctx.cacheControl = { maxAge: 0 }
      ctx.status = 408
      ctx.body = {
        error: {
          code: 'BuildCancelledError',
          message:
            'The package build was cancelled because the client disconnected.',
        },
      } satisfies ErrorResponseBody
      logger.info(
        'BUILD_CANCELLED',
        {
          requestId: ctx.state.id,
          time: now() - start,
          ...ctx.state.resolved,
        },
        packageString ? `BUILD_CANCELLED ${packageString}` : 'BUILD_CANCELLED'
      )
      return
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
        details: getErrorDetails(error),
      })
      return
    }

    if (isClientHttpError(error)) {
      respondWithError(error.status, {
        code: error.name,
        message: error.message,
      })
      return
    }

    const err = error as BuildErrorShape

    switch (err.name) {
      case 'BuildServiceError':
        ctx.cacheControl = { maxAge: 0 }
        respondWithError(503, {
          code: 'BuildServiceError',
          message:
            'The build service encountered a temporary error. Please try again in a few minutes.',
        })
        break

      case 'BuildServiceUnavailableError':
        ctx.cacheControl = { maxAge: 0 }
        respondWithError(503, {
          code: 'BuildServiceUnavailableError',
          message:
            'The build service is temporarily unavailable. Please try again in a few minutes.',
        })
        break

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
        if (err.extra?.suggestedVersion) {
          respondWithError(404, {
            code: 'PackageVersionMismatchError',
            message: `This package has not been published with this particular version. The latest version is \`<code>${err.extra.suggestedVersion}</code>\`.`,
          })
          break
        }

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
          maxAge: force ? 0 : config.CACHE.SIZE_API_ERROR_FATAL,
        }

        respondWithError(status, body.error)
        cacheFailure(status, body)
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
              `This package (or this version) uses ${missingModules}, ` +
              `but does not specify ${
                missingModulesList.length > 1 ? 'them' : 'it'
              } either as a dependency or a peer dependency`,
            details: getErrorDetails(err.originalError) ?? {},
          },
        }

        ctx.cacheControl = {
          maxAge: force ? 0 : config.CACHE.SIZE_API_ERROR_FATAL,
        }

        respondWithError(status, body.error)
        cacheFailure(status, body)
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
              ...getErrorDetails(err.originalError),
            },
          },
        }

        ctx.cacheControl = {
          maxAge: force ? 0 : config.CACHE.SIZE_API_ERROR_FATAL,
        }

        respondWithError(status, body.error)
        cacheFailure(status, body)
        break
      }

      case 'BuildError':
      default: {
        const status = 422
        const details = getErrorDetails(err.originalError) ?? {}
        const errorJSON = {
          code: 'BuildError',
          message: 'Failed to build this package.',
          details,
        }
        respondWithError(status, errorJSON)
        cacheFailure(status, {
          error: errorJSON,
        })
        break
      }
    }
  }
}

export default errorHandler
