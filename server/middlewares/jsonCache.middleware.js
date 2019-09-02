const koaCache = require('koa-cash')

function jsonCacheMiddleware({ get, set, hash: hashFn }) {
  return koaCache({
    async get(key) {
      // Emulate koa-cash cache value
      const value = await get(key)
      return {
        body: value,
        type: 'application/json',
      }
    },
    set(key, value) {
      // We only need the body part from what
      // koa-cash gives us
      set(key, JSON.parse(value.body))
    },
    hash(ctx) {
      return hashFn(ctx)
    },
  })
}

module.exports = jsonCacheMiddleware
