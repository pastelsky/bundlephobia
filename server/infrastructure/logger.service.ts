import { AsyncLocalStorage } from 'node:async_hooks'
import winston from 'winston'

import type { JsonObject } from '../../types/json'

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
  if (value instanceof Error) {
    const payload: LogPayload = {
      message: value.message,
      name: value.name,
    }

    if (value.stack) payload.stack = value.stack

    return payload
  }

  if (
    value !== null &&
    Object.prototype.toString.call(value) === '[object Object]'
  ) {
    // SAFETY: the object tag check establishes that the generic value is a plain object payload.
    return value as LogPayload
  }

  return { error: String(value) }
}

const logFormat = winston.format.printf(info => {
  const date = new Date().toISOString()

  const metadata = toPayload(info.metadata)

  // Keep attribution on existing messages without serializing request headers,
  // authorization, or potentially large result/error payloads.
  const fields = {
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
})

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
