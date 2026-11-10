import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INSPECTOR_HOST = process.env.INSPECTOR_HOST || '127.0.0.1'
const INSPECTOR_PORT = parseInt(process.env.INSPECTOR_PORT || '9229', 10)
const RESULTS_DIR =
  process.env.RESULTS_DIR || path.resolve(__dirname, '../results')
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '500', 10)
const ENABLE_CPU_PROFILE = process.env.ENABLE_CPU_PROFILE !== 'false'
const ENABLE_ALLOC_PROFILE = process.env.ENABLE_ALLOC_PROFILE !== 'false'
const TAKE_HEAP_SNAPSHOTS = process.env.TAKE_HEAP_SNAPSHOTS !== 'false'

fs.mkdirSync(RESULTS_DIR, { recursive: true })

async function getDebuggerUrl(host, port) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port,
      path: '/json',
      headers: {
        Host: `localhost:${port}`,
      },
    }
    const req = http.get(options, res => {
      let data = ''
      res.on('data', chunk => {
        data += chunk
      })
      res.on('end', () => {
        try {
          const list = JSON.parse(data)
          if (list && list.length > 0 && list[0].webSocketDebuggerUrl) {
            let wsUrl = list[0].webSocketDebuggerUrl
            if (host !== 'localhost' && host !== '127.0.0.1') {
              wsUrl = wsUrl.replace('localhost:9229', `${host}:${port}`)
            }
            resolve(wsUrl)
          } else {
            reject(new Error(`No debuggable target found at ${host}:${port}`))
          }
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(5000, () =>
      req.destroy(new Error('Inspector connection timeout')),
    )
  })
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.ws = null
    this.idCounter = 0
    this.pending = new Map()
    this.eventHandlers = new Map()
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl)
      this.ws.onopen = () => resolve()
      this.ws.onerror = err => reject(err)
      this.ws.onmessage = event => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve: res, reject: rej } = this.pending.get(msg.id)
            this.pending.delete(msg.id)
            if (msg.error) rej(new Error(msg.error.message))
            else res(msg.result)
          } else if (msg.method) {
            const handlers = this.eventHandlers.get(msg.method) || []
            for (const h of handlers) h(msg.params)
          }
        } catch (e) {
          console.error('[cdp] Failed to parse message:', e)
        }
      }
    })
  }

  on(method, handler) {
    if (!this.eventHandlers.has(method)) {
      this.eventHandlers.set(method, [])
    }
    this.eventHandlers.get(method).push(handler)
  }

  async send(method, params = {}) {
    const id = ++this.idCounter
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    })
    return res.result?.value
  }

  async takeHeapSnapshot(filename) {
    console.log(`[cdp-monitor] Capturing V8 Heap Snapshot: ${filename}...`)
    const filepath = path.join(RESULTS_DIR, filename)
    const stream = fs.createWriteStream(filepath)

    await this.send('HeapProfiler.enable')

    const chunkHandler = params => {
      stream.write(params.chunk)
    }

    this.on('HeapProfiler.addHeapSnapshotChunk', chunkHandler)

    const start = Date.now()
    await this.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
    stream.end()

    const handlers =
      this.eventHandlers.get('HeapProfiler.addHeapSnapshotChunk') || []
    const idx = handlers.indexOf(chunkHandler)
    if (idx >= 0) handlers.splice(idx, 1)

    const dur = ((Date.now() - start) / 1000).toFixed(1)
    const stats = fs.statSync(filepath)
    const sizeMb = (stats.size / 1024 / 1024).toFixed(1)
    console.log(
      `[cdp-monitor] Heap Snapshot saved: ${filepath} (${sizeMb} MB in ${dur}s)`,
    )
  }

  async startCpuProfile() {
    console.log('[cdp-monitor] Starting V8 CPU profiling...')
    await this.send('Profiler.enable')
    await this.send('Profiler.setSamplingInterval', { interval: 1000 }) // 1000us = 1ms
    await this.send('Profiler.start')
  }

  async stopCpuProfile(filename) {
    console.log(`[cdp-monitor] Stopping V8 CPU profiling: ${filename}...`)
    const res = await this.send('Profiler.stop')
    const filepath = path.join(RESULTS_DIR, filename)
    fs.writeFileSync(filepath, JSON.stringify(res.profile, null, 2))
    console.log(`[cdp-monitor] CPU Profile saved: ${filepath}`)
  }

  async startAllocationProfile() {
    console.log(
      '[cdp-monitor] Starting V8 Allocation sampling (16KB interval)...',
    )
    await this.send('HeapProfiler.enable')
    await this.send('HeapProfiler.startSampling', { samplingInterval: 16384 })
  }

  async stopAllocationProfile(filename) {
    console.log(`[cdp-monitor] Stopping V8 Allocation Profile: ${filename}...`)
    const res = await this.send('HeapProfiler.stopSampling')
    const filepath = path.join(RESULTS_DIR, filename)
    fs.writeFileSync(filepath, JSON.stringify(res.profile, null, 2))
    console.log(`[cdp-monitor] Allocation Profile saved: ${filepath}`)
  }

  async triggerGc() {
    console.log('[cdp-monitor] Triggering V8 Garbage Collection...')
    await this.send('HeapProfiler.collectGarbage')
  }
}

async function main() {
  console.log(
    `[cdp-monitor] Connecting to Inspector at ${INSPECTOR_HOST}:${INSPECTOR_PORT}...`,
  )

  let wsUrl = null
  for (let i = 0; i < 45; i++) {
    try {
      wsUrl = await getDebuggerUrl(INSPECTOR_HOST, INSPECTOR_PORT)
      break
    } catch {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  if (!wsUrl) {
    console.error(
      `[cdp-monitor] Failed to reach inspector at ${INSPECTOR_HOST}:${INSPECTOR_PORT}`,
    )
    process.exit(1)
  }

  const cdp = new CdpClient(wsUrl)
  await cdp.connect()
  console.log('[cdp-monitor] Connected to Node.js V8 Inspector successfully!')

  await cdp.send('Runtime.enable')

  // Take baseline heap snapshot before benchmark load starts
  if (TAKE_HEAP_SNAPSHOTS) {
    await cdp.triggerGc()
    await cdp.takeHeapSnapshot('baseline.heapsnapshot')
  }

  if (ENABLE_CPU_PROFILE) {
    await cdp.startCpuProfile()
  }

  if (ENABLE_ALLOC_PROFILE) {
    await cdp.startAllocationProfile()
  }

  const timelineFile = path.join(RESULTS_DIR, 'cdp-timeline.jsonl')
  const timelineStream = fs.createWriteStream(timelineFile, { flags: 'a' })
  console.log(`[cdp-monitor] Streaming CDP memory metrics to ${timelineFile}`)

  let isStopping = false

  const handleShutdown = async () => {
    if (isStopping) return
    isStopping = true
    console.log(
      '\n[cdp-monitor] Received shutdown signal. Finalizing profiles...',
    )

    try {
      if (ENABLE_CPU_PROFILE) {
        await cdp.stopCpuProfile('build-service-run.cpuprofile')
      }
      if (ENABLE_ALLOC_PROFILE) {
        await cdp.stopAllocationProfile('build-service-allocation.heapprofile')
      }
      if (TAKE_HEAP_SNAPSHOTS) {
        // Trigger GC to clear unreferenced transient objects, then take post-cooldown snapshot
        await cdp.triggerGc()
        await new Promise(r => setTimeout(r, 1000))
        await cdp.takeHeapSnapshot('post-cooldown.heapsnapshot')
      }
    } catch (err) {
      console.error('[cdp-monitor] Error during profile shutdown:', err)
    }

    timelineStream.end(() => {
      console.log('[cdp-monitor] Finished recording timeline.')
      process.exit(0)
    })
  }

  process.on('SIGINT', handleShutdown)
  process.on('SIGTERM', handleShutdown)

  // Polling loop for process memory and handles
  while (!isStopping) {
    try {
      const stats = await cdp.evaluate(`
        (() => {
          const mem = process.memoryUsage();
          const cpu = process.cpuUsage ? process.cpuUsage() : null;
          let activeHandles = 0;
          let activeRequests = 0;
          if (process._getActiveHandles) activeHandles = process._getActiveHandles().length;
          if (process._getActiveRequests) activeRequests = process._getActiveRequests().length;
          return {
            timestamp: new Date().toISOString(),
            rss: mem.rss,
            heapTotal: mem.heapTotal,
            heapUsed: mem.heapUsed,
            external: mem.external,
            arrayBuffers: mem.arrayBuffers || 0,
            cpuUser: cpu ? cpu.user : 0,
            cpuSystem: cpu ? cpu.system : 0,
            activeHandles,
            activeRequests,
          };
        })()
      `)

      if (stats) {
        timelineStream.write(JSON.stringify(stats) + '\n')
      }
    } catch (err) {
      if (!isStopping) {
        console.error('[cdp-monitor] Metric poll error:', err.message)
      }
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }
}

main().catch(err => {
  console.error('[cdp-monitor] Fatal error:', err)
  process.exit(1)
})
