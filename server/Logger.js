const winston  = require('winston');
const LogzioWinstonTransport = require('winston-logzio');
const { SumoLogic } = require('winston-sumologic-transport');
const SumoLogger = require('sumo-logger');


const sumoLogger = new SumoLogger({
  endpoint: process.env.SUMOLOGIC_URL,
});

class Logger {
  constructor() {
    const logzioTransport = new LogzioWinstonTransport({
      name: 'bundlephobia',
      token: process.env.LOGZIO_TOKEN,
    })

    const sumologicTransport = new SumoLogic({
      url: process.env.SUMOLOGIC_URL,
    });

    winston.remove(winston.transports.Console);
    this.logger = winston.createLogger({
      transports: process.env.NODE_ENV !== 'production' ? [] : [logzioTransport, /*sumologicTransport*/]
    });
  }

  info(tag, json, message) {
    this.logger.log('info', message, {
      tag,
      ...json
    })
  }

  error(tag, json, message) {
    console.log('JSON', json)
    this.logger.log('error', message, {
      tag,
      ...json
    })
  }
}

module.exports = new Logger()
