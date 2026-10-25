import { AsyncLocalStorage } from 'node:async_hooks'
import winston from 'winston'

import type { JsonObject, RuntimeValue } from '../../types/json'

interface RequestLogContext {
  requestId?: string
  userAgent: string
  clientType: string
  clientFamily: string
  source: string
}

const requestContext = new AsyncLocalStorage<RequestLogContext>()

export function withRequestLogContext<T>(
  context: RequestLogContext,
  callback: () => T,
): T {
  return requestContext.run(context, callback)
}

type LogPayload = JsonObject

function toPayload<T>(value: T): LogPayload {
  if (value instanceof Error) return errorFields(value) ?? {}

  if (
    value !== null &&
    Object.prototype.toString.call(value) === '[object Object]'
  ) {
    // SAFETY: the object tag check establishes that the generic value is a plain object payload.
    return value as LogPayload
  }

  return { error: String(value) }
}

type LogErrorSource = Partial<Error> & {
  code?: RuntimeValue
  originalError?: RuntimeValue
}

function errorText<T>(value: T): string | undefined {
  return Object.prototype.toString.call(value) === '[object String]'
    ? String(value).slice(0, 4000)
    : undefined
}

function textFields(source: LogErrorSource): LogPayload {
  const fields: LogPayload = {}

  for (const key of ['name', 'code', 'message', 'stack'] as const) {
    const text = errorText(source[key])

    if (text !== undefined) fields[key] = text
  }

  return fields
}

function arrayErrorFields(
  causes: unknown[],
  depth: number,
): LogPayload | undefined {
  if (depth >= 2) return undefined

  const errors = causes.slice(0, 5).flatMap(item => {
    const fields = errorFields(item, depth + 1)

    return fields ? [fields] : []
  })

  return errors.length ? { errors } : undefined
}

function errorFields(cause: unknown, depth = 0): LogPayload | undefined {
  const message = errorText(cause)

  if (message !== undefined) return { message }

  if (Array.isArray(cause)) return arrayErrorFields(cause, depth)

  if (Object(cause) !== cause) return undefined

  // SAFETY: cause is an object; each selected diagnostic field is checked before use.
  const source = cause as LogErrorSource

  return objectErrorFields(source, depth)
}

function objectErrorFields(
  source: LogErrorSource,
  depth: number,
): LogPayload | undefined {
  const fields = textFields(source)

  if (depth < 2) {
    for (const key of ['cause', 'originalError'] as const) {
      const nested = errorFields(source[key], depth + 1)

      if (nested) fields[key] = nested
    }
  }

  return Object.keys(fields).length ? fields : undefined
}

export function formatLogMessage(
  info: winston.Logform.TransformableInfo,
): string {
  const date = new Date().toISOString()

  const metadata = toPayload(info.metadata)
  const level = info[Symbol.for('level')] ?? info.level

  // Keep attribution on existing messages without serializing request headers,
  // authorization, or potentially large result/error payloads.
  const fields = {
    tag: metadata.tag,
    type: metadata.type,
    time: metadata.time,
    error:
      level === 'error' ? errorFields(metadata.error ?? metadata) : undefined,
    details: errorFields(metadata.details),
    requestId: metadata.requestId,
    userAgent: metadata.userAgent,
    clientType: metadata.clientType,
    clientFamily: metadata.clientFamily,
    source: metadata.source,
    operation: metadata.operation,
    packageString: metadata.packageString,
    cache: metadata.cache,
    buildRequested: metadata.buildRequested,
  }

  const context = Object.values(fields).some(value => value !== undefined)
    ? ` ${JSON.stringify(fields)}`
    : ''

  return `${date} ${info.level}: ${info.message}${context}`
}

const logFormat = winston.format.printf(formatLogMessage)

class Logger {
  private readonly logger: winston.Logger

  constructor() {
    this.logger = winston.createLogger({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), logFormat),
        }),
      ],
    })
  }

  info<T>(tag: string, json: T, message: string): void {
    this.logger.info(message, {
      metadata: {
        ...requestContext.getStore(),
        message,
        tag,
        ...toPayload(json),
      },
    })
  }

  error<T>(tag: string, json: T, message: string): void {
    this.logger.error(message, {
      metadata: {
        ...requestContext.getStore(),
        tag,
        ...toPayload(json),
      },
    })
  }

  increment(_label: string): void {}

  decrement(_label: string): void {}

  histogram(_label: string, _value: number): void {}

  set(_label: string, _value: string | number): void {}

  timing(_label: string, _value: number): void {}
}

const logger = new Logger()

export default logger
