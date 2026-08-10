const debug = require('debug')('bp:firebase-metrics')

const metrics = new Map()

function getPayloadBytes(value) {
  if (value === undefined || value === null) return 0

  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function flush() {
  if (metrics.size === 0) return

  const summary = Object.fromEntries(
    [...metrics.entries()].map(([key, value]) => [key, { ...value }])
  )
  metrics.clear()
  debug('Firebase usage summary: %O', summary)
}

const flushTimer = setInterval(flush, 60_000)
flushTimer.unref()

function recordFirebaseOperation({ direction, path, value }) {
  const key = `${direction}:${path}`
  const current = metrics.get(key) || { calls: 0, payloadBytes: 0 }
  current.calls += 1
  current.payloadBytes += getPayloadBytes(value)
  metrics.set(key, current)
}

module.exports = { recordFirebaseOperation }
