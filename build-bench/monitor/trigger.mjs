import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INSPECTOR_HOST = process.env.INSPECTOR_HOST || '127.0.0.1'
const INSPECTOR_PORT = parseInt(process.env.INSPECTOR_PORT || '9229', 10)
const RESULTS_DIR =
  process.env.RESULTS_DIR || path.resolve(__dirname, '../results')

const action = process.argv[2] || 'heap'
const label = process.argv[3] || Date.now().toString()

async function getDebuggerUrl(host, port) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port,
      path: '/json',
      headers: { Host: `localhost:${port}` },
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
            reject(new Error(`No debugger found at ${host}:${port}`))
          }
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(5000, () =>
      req.destroy(new Error('Timeout connecting to inspector')),
    )
  })
}

async function main() {
  const wsUrl = await getDebuggerUrl(INSPECTOR_HOST, INSPECTOR_PORT)
  const ws = new WebSocket(wsUrl)

  let idCounter = 0
  const pending = new Map()
  const eventHandlers = new Map()

  ws.onmessage = event => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    } else if (msg.method) {
      const handlers = eventHandlers.get(msg.method) || []
      for (const h of handlers) h(msg.params)
    }
  }

  await new Promise(r => {
    ws.onopen = r
  })

  const send = (method, params = {}) => {
    const id = ++idCounter
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }

  switch (action) {
    case 'gc': {
      console.log('Triggering explicit V8 Garbage Collection...')
      await send('HeapProfiler.enable')
      await send('HeapProfiler.collectGarbage')
      console.log('GC complete.')
      break
    }
    case 'heap': {
      const filename = `snapshot-${label}.heapsnapshot`
      const filepath = path.join(RESULTS_DIR, filename)
      console.log(`Writing V8 Heap Snapshot to ${filepath}...`)
      const stream = fs.createWriteStream(filepath)
      await send('HeapProfiler.enable')
      const handler = p => stream.write(p.chunk)
      eventHandlers.set('HeapProfiler.addHeapSnapshotChunk', [handler])
      await send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
      stream.end()
      console.log(`Snapshot saved: ${filepath}`)
      break
    }
    case 'report': {
      console.log('Generating Node.js diagnostic report...')
      const res = await send('Runtime.evaluate', {
        expression:
          'process.report ? process.report.writeReport() : "report_not_supported"',
        returnByValue: true,
      })
      console.log('Diagnostic report generated:', res.result?.value)
      break
    }
    default:
      console.log(`Unknown action: ${action}. Use: gc, heap, or report`)
  }

  ws.close()
}

main().catch(err => {
  console.error('Trigger error:', err)
  process.exit(1)
})
