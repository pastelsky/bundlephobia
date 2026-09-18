import winston from 'winston'

import type { JsonObject } from '../types/json'

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

  return `${date} ${info.level}: ${info.message}`
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
        message,
        tag,
        ...toPayload(json),
      },
    })
  }

  error<T>(tag: string, json: T, message: string): void {
    this.logger.error(message, {
      metadata: {
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
