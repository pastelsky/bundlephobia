import type { Middleware } from 'koa'
import now from 'performance-now'
import createDebug from 'debug'

import { toErrorDetail } from '../../../utils'
import config from '../../config/server.config'
import { createAnalysisKey } from '../../analysis/analysis.key'
import { toLegacyJavaScriptError } from '../../analysis/adapters/legacy-error.mapper'
import { failureCache } from '../../infrastructure/runtime.init'
import logger from '../../infrastructure/logger.service'
import { isJobCancelledError } from '../../infrastructure/queue.service'
import type { RuntimeValue } from '../../../types/json'

const debug = createDebug('bp:error')

const MAX_ERROR_LIST_ITEMS = 20

interface ErrorResponseBody {
  error: {
    code: string
    message: string
    details?: RuntimeValue
  }
}

interface BuildErrorContract extends Error {
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
  if (
    !('status' in error) ||
    Object.prototype.toString.call(error.status) !== '[object Number]'
  ) {
    return false
  }

  const status = Number(error.status)

  return Number.isInteger(status) && status >= 400 && status < 500
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

function getErrorDetails<T>(originalError: T) {
  const detail = toErrorDetail(originalError)

  return detail ? { originalError: detail } : undefined
}

type KoaContext = Parameters<Middleware>[0]

type ErrorResponse = {
  code: string
  message?: string
  details?: RuntimeValue
}

interface ErrorHandlerContext {
  ctx: KoaContext
  force: RuntimeValue
  start: number
  packageString?: string
  cacheFailure: (status: number, body: RuntimeValue) => void
  respondWithError: (status: number, response: ErrorResponse) => void
}

type BuildErrorHandler = (
  context: ErrorHandlerContext,
  error: BuildErrorContract,
) => void

function setFatalCache(context: ErrorHandlerContext) {
  context.ctx.cacheControl = {
    maxAge: context.force ? 0 : config.CACHE.SIZE_API_ERROR_FATAL,
  }
}

function respondTemporaryError(
  context: ErrorHandlerContext,
  code: string,
  message: string,
) {
  context.ctx.cacheControl = { maxAge: 0 }
  context.respondWithError(503, { code, message })
}

const handleBuildServiceError: BuildErrorHandler = context => {
  respondTemporaryError(
    context,
    'BuildServiceError',
    'The build service encountered a temporary error. Please try again in a few minutes.',
  )
}

const handleBuildServiceUnavailableError: BuildErrorHandler = context => {
  respondTemporaryError(
    context,
    'BuildServiceUnavailableError',
    'The build service is temporarily unavailable. Please try again in a few minutes.',
  )
}

const handleBlocklistedPackageError: BuildErrorHandler = context => {
  context.respondWithError(403, {
    code: 'BlocklistedPackageError',
    message:
      'The package you were looking for is blocklisted ' +
      "because it failed to build multiple times in the past and further tries aren't likely to succeed. This can " +
      "happen if this package wasn't meant to be bundled in a client side application.",
  })
}

const handleUnsupportedPackageError: BuildErrorHandler = (context, error) => {
  context.ctx.cacheControl = {
    maxAge: context.force ? 0 : config.CACHE.SIZE_API_ERROR_UNSUPPORTED,
  }
  context.respondWithError(403, {
    code: 'UnsupportedPackageError',
    message: `The package you were looking for is unsupported and cannot be built by bundlephobia — ${
      error.extra?.reason ?? 'unknown reason'
    }`,
  })
}

const handlePackageNotFoundError: BuildErrorHandler = context => {
  context.respondWithError(404, {
    code: 'PackageNotFoundError',
    message: "The package you were looking for doesn't exist.",
  })
}

const handlePackageVersionMismatchError: BuildErrorHandler = (
  context,
  error,
) => {
  const suggestedVersion = error.extra?.suggestedVersion

  if (suggestedVersion) {
    context.respondWithError(404, {
      code: 'PackageVersionMismatchError',
      message: `This package has not been published with this particular version. The latest version is \`<code>${suggestedVersion}</code>\`.`,
    })

    return
  }

  const validVersions = formatSentence(
    (error.extra?.validVersions ?? []).map(
      version => `\`<code>${version}</code>\``,
    ),
  )

  context.respondWithError(404, {
    code: 'PackageVersionMismatchError',
    message: `This package has not been published with this particular version. Valid versions - ${validVersions}`,
  })
}

const handleInstallError: BuildErrorHandler = context => {
  context.respondWithError(500, {
    code: 'InstallError',
    message: 'Installing the package failed.',
  })
  context.ctx.cacheControl = { maxAge: 0 }
}

const handleEntryPointError: BuildErrorHandler = context => {
  const status = 422

  const body = {
    error: {
      code: 'EntryPointError',
      message:
        'We could not guess a valid entry point for this package. ' +
        "Perhaps the author hasn't specified one in its package.json ?",
    },
  }

  setFatalCache(context)
  context.respondWithError(status, body.error)
  context.cacheFailure(status, body)
}

const handleMissingDependencyError: BuildErrorHandler = (context, error) => {
  const status = 422
  const missingModulesList = error.extra?.missingModules ?? []

  const missingModules = formatSentence(
    missingModulesList.map(module => `\`<code>${module}</code>\``),
  )

  const body = {
    error: {
      code: 'MissingDependencyError',
      message:
        `This package (or this version) uses ${missingModules}, ` +
        `but does not specify ${
          missingModulesList.length > 1 ? 'them' : 'it'
        } either as a dependency or a peer dependency`,
      details: getErrorDetails(error.originalError) ?? {},
    },
  }

  setFatalCache(context)
  context.respondWithError(status, body.error)
  context.cacheFailure(status, body)
}

const handleMinifyError: BuildErrorHandler = (context, error) => {
  const status = 422

  const body = {
    error: {
      code: 'MinifyError',
      message:
        'We could not minify one of the source files in this package or its dependencies. ' +
        `Please verify if the contents of <code>${
          error.extra?.filePath ?? 'unknown file'
        }</code> can be minified using <a href="https://try.terser.org/" target="_blank">terser</a>.`,
      details: { ...getErrorDetails(error.originalError) },
    },
  }

  setFatalCache(context)
  context.respondWithError(status, body.error)
  context.cacheFailure(status, body)
}

const handleBuildError: BuildErrorHandler = (context, error) => {
  const status = 422
  const details = getErrorDetails(error.originalError) ?? {}

  const errorJSON = {
    code: 'BuildError',
    message: 'Failed to build this package.',
    details,
  }

  context.respondWithError(status, errorJSON)
  context.cacheFailure(status, { error: errorJSON })
}

const buildErrorHandlers = {
  BuildServiceError: handleBuildServiceError,
  BuildServiceUnavailableError: handleBuildServiceUnavailableError,
  BlocklistedPackageError: handleBlocklistedPackageError,
  UnsupportedPackageError: handleUnsupportedPackageError,
  PackageNotFoundError: handlePackageNotFoundError,
  PackageVersionMismatchError: handlePackageVersionMismatchError,
  InstallError: handleInstallError,
  EntryPointError: handleEntryPointError,
  MissingDependencyError: handleMissingDependencyError,
  MinifyError: handleMinifyError,
  BuildError: handleBuildError,
} satisfies Record<string, BuildErrorHandler>

function handleCancelledError(context: ErrorHandlerContext) {
  const { ctx, packageString, start } = context
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
      ...ctx.state.analysis,
    },
    packageString ? `BUILD_CANCELLED ${packageString}` : 'BUILD_CANCELLED',
  )
}

function handleUnknownError<T>(context: ErrorHandlerContext, error: T) {
  // SAFETY: only the optional error code is read from a caught runtime value.
  const errorObject = error as { code?: string } | null

  if (errorObject?.code === 'JOB_EXPIRED') {
    context.ctx.cacheControl = { maxAge: 0 }
    context.respondWithError(503, {
      code: 'QueueTimeoutError',
      message:
        'The build queue is currently full and this request timed out. ' +
        'Please try again in a few minutes.',
    })

    return
  }

  if (errorObject?.code === 'QUEUE_CLEARED') {
    context.ctx.cacheControl = { maxAge: 0 }
    context.respondWithError(503, {
      code: 'QueueClearedError',
      message:
        'The build queue was cleared. Please try building the package again.',
    })

    return
  }

  context.respondWithError(500, {
    code: 'UnknownError',
    details: getErrorDetails(error),
  })
}

function handleCaughtError<T>(context: ErrorHandlerContext, error: T) {
  if (isJobCancelledError(error)) {
    handleCancelledError(context)

    return
  }

  if (!(error instanceof Error)) {
    handleUnknownError(context, error)

    return
  }

  if (isClientHttpError(error)) {
    context.respondWithError(error.status, {
      code: error.name,
      message: error.message,
    })

    return
  }

  // SAFETY: this branch is reached only after the Error instance guard above.
  const buildError = error as BuildErrorContract

  // SAFETY: the fallback handles names not present in this closed handler table.
  const handler =
    buildErrorHandlers[buildError.name as keyof typeof buildErrorHandlers] ??
    handleBuildError

  handler(context, buildError)
}

const errorHandler: Middleware = async (ctx, next) => {
  const { force } = ctx.query
  const start = now()
  let packageString = ctx.state.resolved?.packageString

  const cacheFailure = (status: number, body: RuntimeValue) => {
    if (!packageString) {
      return
    }

    debug('saved %s to failure cache', packageString)
    const analysis = ctx.state.analysis
    const language = analysis?.language ?? 'javascript'
    const operation = analysis?.operation ?? 'package-analysis'
    failureCache.set(
      createAnalysisKey({
        language,
        operation,
        packageSpecifier: packageString,
      }),
      { status, body },
    )
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
      details?: RuntimeValue
    },
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
        ...ctx.state.analysis,
        details,
      },
      packageString ? `${code} ${packageString}` : code,
    )
  }

  try {
    await next()
  } catch (caughtError) {
    const error = toLegacyJavaScriptError(caughtError)
    packageString = ctx.state.resolved?.packageString
    ctx.cacheControl = {
      maxAge: force ? 0 : config.CACHE.SIZE_API_ERROR,
    }
    handleCaughtError(
      {
        ctx,
        force,
        start,
        packageString,
        cacheFailure,
        respondWithError,
      },
      error,
    )
  }
}

export default errorHandler
