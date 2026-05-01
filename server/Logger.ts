import winston from 'winston'

type LogPayload = Record<string, unknown>

function toPayload(value: unknown): LogPayload {
  if (value instanceof Error) {
    return { message: value.message, name: value.name, stack: value.stack }
  }
  if (typeof value === 'object' && value !== null) {
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

  info(tag: string, json: LogPayload, message: string): void {
    this.logger.info(message, {
      metadata: {
        message,
        tag,
        ...json,
      },
    })
  }

  error(tag: string, json: unknown, message: string): void {
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
