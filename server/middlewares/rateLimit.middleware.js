// Modified package `koa-better-ratelimit`
// to accept original client ips from cloudflare

const ipchecker = require('ipchecker')
const defaults = {
  duration: 1000 * 60 * 60,
  whiteList: [],
  blackList: [],
  accessLimited: '429: Too Many Requests.',
  accessForbidden: '403: This is forbidden area for you.',
  max: 100,
  env: null,
}

/**
 * With options through init you can control
 * black/white lists, limit per ip and reset interval.
 *
 * @param {Object} options
 * @api public
 */
module.exports = function betterlimit(options = {}) {
  const db = {}

  for (const key in defaults) {
    if (!options[key]) {
      options[key] = defaults[key]
    }
  }

  if (options.message_429) {
    options.accessLimited = options.message_429
  }

  if (options.message_403) {
    options.accessForbidden = options.message_403
  }

  const whiteListMap = ipchecker.map(options.whiteList)
  const blackListMap = ipchecker.map(options.blackList)

  return function* ratelimit(next) {
    const ip =
      this.request.header['x-koaip'] ||
      this.request.header['cf-connecting-ip'] ||
      this.ip

    if (!ip) {
      return yield* next
    }
    if (ipchecker.check(ip, blackListMap)) {
      this.response.status = 403
      this.response.body = options.accessForbidden
      return
    }
    if (ipchecker.check(ip, whiteListMap)) {
      return yield* next
    }

    const now = Date.now()
    const reset = now + options.duration

    if (!db.hasOwnProperty(ip)) {
      db[ip] = { ip, reset, limit: options.max }
    }

    const delta = db[ip].reset - now
    const retryAfter = (delta / 1000) | 0

    db[ip].limit = db[ip].limit - 1
    this.response.set('X-RateLimit-Limit', options.max)

    if (db[ip].reset > now) {
      const rateLimiting = db[ip].limit < 0 ? 0 : db[ip].limit
      this.response.set('X-RateLimit-Remaining', rateLimiting)
    }

    if (db[ip].limit < 0 && db[ip].reset < now) {
      db[ip] = { ip, reset, limit: options.max }
      db[ip].limit = db[ip].limit - 1
      this.response.set('X-RateLimit-Remaining', db[ip].limit)
    }

    this.response.set('X-RateLimit-Reset', db[ip].reset)

    if (db[ip].limit < 0) {
      this.response.set('Retry-After', retryAfter)
      this.response.status = 429
      this.response.body = options.accessLimited
      return
    }

    return yield* next
  }
}
