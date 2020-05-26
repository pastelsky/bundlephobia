const winston = require('winston')
const StatsD = require('hot-shots')
const WinstonGraylog2 = require('winston-graylog2')

const statsClient = new StatsD({
  port: 8086,
  globalTags: { env: process.env.NODE_ENV },
  errorHandler: (err, a) => console.error('error', err, a),
  telegraf: true,
})

const graylogOptions = {
  name: 'graylog',
  level: 'debug',
  silent: false,
  handleExceptions: false,
  graylog: {
    servers: [
      { host: process.env.GRAYLOG_HOST, port: process.env.GRAYLOG_PORT },
    ],
    hostname: 'bundlephobia',
    bufferSize: 1400,
  },
}

class Logger {
  constructor() {
    let transports = []

    if (process.env.NODE_ENV === 'production') {
      transports.push(new WinstonGraylog2(graylogOptions))
    }

    winston.remove(winston.transports.Console)
    this.logger = winston.createLogger({
      transports,
    })
  }

  info(tag, json, message) {
    this.logger.info(message, {
      metadata: {
        message,
        tag,
        ...json,
      },
    })
  }

  error(tag, json, message) {
    this.logger.error(message, {
      metadata: {
        tag,
        ...json,
      },
    })
  }

  // statsd methods

  increment(label) {
    statsClient.increment(label)
  }

  decrement(label) {
    statsClient.increment(label)
  }

  histogram(label, value) {
    statsClient.histogram(label, value)
  }

  set(label, value) {
    statsClient.set(label, value)
  }

  timing(label, value) {
    statsClient.timing(label, value)
  }
}

module.exports = new Logger()
