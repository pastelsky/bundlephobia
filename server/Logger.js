const winston  = require('winston');
const logzioWinstonTransport = require('winston-logzio');

class Logger {
  constructor() {
    winston.add(logzioWinstonTransport, {
      token: process.env.LOGZIO_TOKEN,
      host: 'listener.logz.io',
    });

    winston.remove(winston.transports.Console);
    this.logger = winston
  }

  info(tag, json, message) {
    // console.log('JSON', json)
    this.logger.log('info', message, {
      type: tag,
      message: json
    })
  }

  error(tag, json, message) {
    // console.log('JSON', json)
    this.logger.log('error', message, {
      type: tag,
      message: json
    })
  }
}

module.exports = new Logger()
