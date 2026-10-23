import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

const PATH_PREFIX = '/stats'

const DEFAULT_DATA_PATH = '/var/lib/bundlephobia-victoriametrics'

interface GatewayConfig {
  binary: string
  storagePath: string
  scrapeConfig: string
  listenAddr: string
  retention: string
  memoryAllowedBytes: string
  minFreeDiskSpaceBytes: string
  startupTimeoutMs: number
  idleTimeoutMs: number
}

interface ActiveStorage {
  origin: string
  stop: () => Promise<void>
}

interface StatsGatewayOptions {
  startStorage: () => Promise<ActiveStorage>
  idleTimeoutMs?: number
}

interface StatsGateway {
  server: Server
  close: () => Promise<void>
}

function getEnv(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
): string {
  return environment[name] || fallback
}

function getNumericEnv(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  return Number(environment[name]) || fallback
}

export function getConfig(
  environment: NodeJS.ProcessEnv = process.env,
): GatewayConfig {
  return {
    binary: getEnv(
      environment,
      'VICTORIAMETRICS_BIN',
      '/usr/local/bin/victoria-metrics-prod',
    ),
    storagePath: getEnv(
      environment,
      'VICTORIAMETRICS_STORAGE_PATH',
      DEFAULT_DATA_PATH,
    ),
    scrapeConfig: getEnv(
      environment,
      'VICTORIAMETRICS_SCRAPE_CONFIG',
      '/etc/bundlephobia-victoriametrics/promscrape.yml',
    ),
    listenAddr: getEnv(
      environment,
      'VICTORIAMETRICS_LISTEN_ADDR',
      '127.0.0.1:8428',
    ),
    retention: getEnv(environment, 'VICTORIAMETRICS_RETENTION', '30d'),
    memoryAllowedBytes: getEnv(
      environment,
      'VICTORIAMETRICS_MEMORY_ALLOWED_BYTES',
      '256MiB',
    ),
    minFreeDiskSpaceBytes: getEnv(
      environment,
      'VICTORIAMETRICS_MIN_FREE_DISK_SPACE_BYTES',
      '1GiB',
    ),
    startupTimeoutMs: getNumericEnv(
      environment,
      'VICTORIAMETRICS_STARTUP_TIMEOUT_MS',
      30000,
    ),
    idleTimeoutMs: getNumericEnv(
      environment,
      'STATS_IDLE_TIMEOUT_MS',
      30 * 60 * 1000,
    ),
  }
}

function getReadinessUrl(config: GatewayConfig): string {
  return 'http://' + config.listenAddr + PATH_PREFIX + '/-/ready'
}

async function waitUntilReady(
  child: ChildProcess,
  config: GatewayConfig,
): Promise<void> {
  const deadline = Date.now() + config.startupTimeoutMs
  let spawnError: Error | undefined

  child.once('error', error => {
    spawnError = error
  })

  while (Date.now() < deadline) {
    if (spawnError) throw spawnError

    if (child.exitCode !== null) {
      throw new Error('VictoriaMetrics exited before becoming ready')
    }

    try {
      const response = await fetch(getReadinessUrl(config), {
        signal: AbortSignal.timeout(500),
      })

      if (response.ok) return
    } catch {
      // The service is still starting or its readiness endpoint is not open.
    }

    await delay(200)
  }

  throw new Error('VictoriaMetrics did not become ready before the timeout')
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return

  const exited = new Promise(resolve => child.once('exit', resolve))
  child.kill('SIGTERM')

  const stopped = await Promise.race([
    exited.then(() => true),
    delay(10000).then(() => false),
  ])

  if (!stopped) {
    child.kill('SIGKILL')
    await exited
  }
}

export async function startVictoriaMetrics(
  config: GatewayConfig,
): Promise<ActiveStorage> {
  await mkdir(config.storagePath, { recursive: true })

  const child = spawn(
    config.binary,
    [
      '-storageDataPath=' + config.storagePath,
      '-promscrape.config=' + config.scrapeConfig,
      '-promscrape.configCheckInterval=10s',
      '-promscrape.maxScrapeSize=16MiB',
      '-retentionPeriod=' + config.retention,
      '-httpListenAddr=' + config.listenAddr,
      '-http.pathPrefix=' + PATH_PREFIX,
      '-memory.allowedBytes=' + config.memoryAllowedBytes,
      '-storage.minFreeDiskSpaceBytes=' + config.minFreeDiskSpaceBytes,
      '-loggerLevel=WARN',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )

  try {
    await waitUntilReady(child, config)
  } catch (error) {
    await stopChild(child)
    throw error
  }

  return {
    origin: 'http://' + config.listenAddr,
    stop: () => stopChild(child),
  }
}

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

export function createStatsGateway({
  startStorage,
  idleTimeoutMs = 30 * 60 * 1000,
}: StatsGatewayOptions): StatsGateway {
  let storage: ActiveStorage | undefined
  let starting: Promise<ActiveStorage> | undefined
  let idleTimer: NodeJS.Timeout | undefined
  let activeRequests = 0
  let shuttingDown = false

  const server = http.createServer(async (
    request: IncomingMessage,
    response: ServerResponse,
  ) => {
    const requestUrl = new URL(request.url || '/', 'http://stats.local')
    const requestPath = requestUrl.pathname

    if (requestPath === PATH_PREFIX || requestPath === PATH_PREFIX + '/') {
      response.writeHead(302, { Location: PATH_PREFIX + '/vmui/' })
      response.end()

      return
    }

    if (!requestPath.startsWith(PATH_PREFIX + '/')) {
      response.writeHead(404)
      response.end('Not found')

      return
    }

    if (shuttingDown) {
      response.writeHead(503, { 'Retry-After': '2' })
      response.end('Stats service is stopping. Retry shortly.')

      return
    }

    clearTimeout(idleTimer)
    activeRequests += 1

    let finished = false

    const finishRequest = () => {
      if (finished) return
      finished = true
      activeRequests -= 1
      scheduleIdleShutdown()
    }

    response.once('finish', finishRequest)
    response.once('close', finishRequest)

    try {
      const activeStorage = await ensureStorage()

      const headers = Object.fromEntries(
        Object.entries(request.headers).filter(
          ([name]) => !HOP_BY_HOP_HEADERS.has(name.toLowerCase()),
        ),
      )

      const upstream = http.request(
        activeStorage.origin + request.url,
        {
          method: request.method,
          headers,
        },
        upstreamResponse => {
          const responseHeaders = Object.fromEntries(
            Object.entries(upstreamResponse.headers).filter(
              ([name]) =>
                name && !HOP_BY_HOP_HEADERS.has(name.toLowerCase()),
            ),
          )

          response.writeHead(
            upstreamResponse.statusCode || 502,
            responseHeaders,
          )
          upstreamResponse.pipe(response)
        },
      )

      upstream.on('error', error => {
        if (response.headersSent) {
          response.destroy(error)

          return
        }

        response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('VictoriaMetrics is unavailable.')
      })
      request.pipe(upstream)
    } catch (error) {
      console.error('Unable to start VictoriaMetrics:', error)

      if (!response.headersSent) {
        response.writeHead(503, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Retry-After': '5',
        })
        response.end('Stats is starting. Retry in a few seconds.')
      }
    }
  })

  server.keepAliveTimeout = 5000
  server.headersTimeout = 10000

  function scheduleIdleShutdown(): void {
    clearTimeout(idleTimer)

    if (activeRequests > 0 || shuttingDown) return

    idleTimer = setTimeout(async () => {
      if (activeRequests > 0) {
        scheduleIdleShutdown()

        return
      }

      shuttingDown = true

      if (storage) {
        try {
          await storage.stop()
        } catch (error) {
          console.error('Unable to stop VictoriaMetrics cleanly:', error)
        }

        storage = undefined
      }

      server.close()
    }, idleTimeoutMs)
    idleTimer.unref()
  }

  async function ensureStorage(): Promise<ActiveStorage> {
    if (storage) return storage
    if (!starting) {
      starting = startStorage()
        .then(activeStorage => {
          storage = activeStorage
          scheduleIdleShutdown()
          return activeStorage
        })
        .finally(() => {
          starting = undefined
        })
    }
    return starting
  }

  return {
    server,
    async close() {
      clearTimeout(idleTimer)
      shuttingDown = true
      if (storage) {
        await storage.stop()
        storage = undefined
      }
      server.close()
    },
  }
}

function listenOnSystemdSocket(
  server: Server,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const inheritedFdCount = Number(environment.LISTEN_FDS)
  const inheritedPid = Number(environment.LISTEN_PID)

  if (inheritedFdCount !== 1 || inheritedPid !== process.pid) {
    throw new Error('Expected one systemd-activated listening socket')
  }

  server.listen({ fd: 3 })
}

async function main(): Promise<void> {
  const config = getConfig()
  const gateway = createStatsGateway({
    startStorage: () => startVictoriaMetrics(config),
    idleTimeoutMs: config.idleTimeoutMs,
  })

  listenOnSystemdSocket(gateway.server)
  console.info('On-demand VictoriaMetrics stats gateway is ready')

  const shutdown = () => {
    void gateway.close().finally(() => process.exit(0))
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error('Unable to start stats gateway:', error)
    process.exitCode = 1
  })
}
