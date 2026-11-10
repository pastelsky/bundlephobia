import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TARGET_HOST = process.env.TARGET_HOST || 'localhost'
const TARGET_PORT = parseInt(process.env.TARGET_PORT || '7002', 10)
const WORKLOAD_FILE =
  process.env.WORKLOAD_FILE ||
  path.resolve(__dirname, '../workload/packages.json')
const RESULTS_DIR =
  process.env.RESULTS_DIR || path.resolve(__dirname, '../results')
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '1', 10)
const ITERATIONS = parseInt(process.env.ITERATIONS || '1', 10)

fs.mkdirSync(RESULTS_DIR, { recursive: true })

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: CONCURRENCY * 2,
  timeout: 120000,
})

function executeBuildRequest(item) {
  return new Promise(resolve => {
    const startTime = Date.now()
    const startIso = new Date(startTime).toISOString()
    const encodedPkg = encodeURIComponent(item.package)
    const reqPath = `${item.endpoint}?p=${encodedPkg}`

    const req = http.request(
      {
        hostname: TARGET_HOST,
        port: TARGET_PORT,
        path: reqPath,
        method: 'GET',
        agent,
        timeout: 90000,
      },
      res => {
        let body = ''
        res.on('data', chunk => {
          body += chunk
        })
        res.on('end', () => {
          const endTime = Date.now()
          const durationMs = endTime - startTime
          let parsedData = null
          try {
            parsedData = JSON.parse(body)
          } catch {}

          const record = {
            startTime: startIso,
            endTime: new Date(endTime).toISOString(),
            package: item.package,
            endpoint: item.endpoint,
            tier: item.tier,
            originalBuildMs: item.originalBuildMs ?? null,
            status: res.statusCode,
            durationMs,
            size: parsedData?.size ?? null,
            gzip: parsedData?.gzip ?? null,
            error:
              res.statusCode >= 400
                ? parsedData?.name || parsedData?.message || 'Error'
                : null,
          }
          resolve(record)
        })
      },
    )

    req.on('error', err => {
      const endTime = Date.now()
      resolve({
        startTime: startIso,
        endTime: new Date(endTime).toISOString(),
        package: item.package,
        endpoint: item.endpoint,
        tier: item.tier,
        originalBuildMs: item.originalBuildMs ?? null,
        status: 0,
        durationMs: endTime - startTime,
        size: null,
        gzip: null,
        error: err.message,
      })
    })

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out after 90s'))
    })

    req.end()
  })
}

async function main() {
  console.log(
    `=================================================================`,
  )
  console.log(
    `            Bundlephobia Build Service Bench Runner              `,
  )
  console.log(
    `=================================================================`,
  )
  console.log(`Target:       http://${TARGET_HOST}:${TARGET_PORT}`)
  console.log(`Workload:     ${WORKLOAD_FILE}`)
  console.log(`Concurrency:  ${CONCURRENCY}`)
  console.log(`Iterations:   ${ITERATIONS}`)
  console.log(`Results:      ${RESULTS_DIR}`)
  console.log(
    `-----------------------------------------------------------------`,
  )

  const workloadData = JSON.parse(fs.readFileSync(WORKLOAD_FILE, 'utf8'))
  const timelinePath = path.join(RESULTS_DIR, 'build-timeline.jsonl')
  const timelineStream = fs.createWriteStream(timelinePath, { flags: 'a' })

  // Build the complete queue of tasks
  const queue = []
  for (let iter = 1; iter <= ITERATIONS; iter++) {
    for (const item of workloadData) {
      queue.push({ ...item, iteration: iter })
    }
  }

  console.log(
    `Queued ${queue.length} total build tasks across ${workloadData.length} unique package targets.\n`,
  )

  let completed = 0
  const total = queue.length
  let queueIndex = 0

  async function worker(workerId) {
    while (queueIndex < queue.length) {
      const current = queue[queueIndex++]
      const progress = `[${++completed}/${total}]`

      console.log(
        `${progress} [Worker ${workerId}] Building: ${current.package} (${current.endpoint}, tier: ${current.tier})...`,
      )

      const result = await executeBuildRequest(current)
      timelineStream.write(JSON.stringify(result) + '\n')

      const statusTag =
        result.status === 200 ? 'SUCCESS' : `FAILED (${result.status})`
      const durSec = (result.durationMs / 1000).toFixed(2)
      const sizeStr = result.size
        ? `${(result.size / 1024).toFixed(1)} kB`
        : '-'
      const gzipStr = result.gzip
        ? `${(result.gzip / 1024).toFixed(1)} kB`
        : '-'

      console.log(
        `  -> ${statusTag} in ${durSec}s | raw: ${sizeStr} | gzip: ${gzipStr} | ${result.error || ''}`,
      )
    }
  }

  const workers = []
  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push(worker(w + 1))
  }

  await Promise.all(workers)

  timelineStream.end(() => {
    console.log(
      `\n=================================================================`,
    )
    console.log(`All ${total} tasks completed. Results written to:`)
    console.log(`  ${timelinePath}`)
    console.log(
      `=================================================================`,
    )
  })
}

main().catch(err => {
  console.error('Runner failed:', err)
  process.exit(1)
})
