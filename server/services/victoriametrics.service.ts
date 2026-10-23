import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import httpProxy from 'http-proxy'

const PATH_PREFIX = '/stats'

interface VictoriaMetricsConfig {
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

interface RunningVictoriaMetrics {
  origin: string
  child: ChildProcess
}

const statsProxy = httpProxy.createProxyServer()

function getConfig(environment: NodeJS.ProcessEnv): VictoriaMetricsConfig {
  const getValue = (name: string, fallback: string): string =>
    environment[name] || fallback

  const getNumber = (name: string, fallback: number): number =>
    Number(environment[name]) || fallback

  return {
    binary: getValue(
      'VICTORIAMETRICS_BIN',
      '/usr/local/bin/victoria-metrics-prod',
    ),
    storagePath: getValue(
      'VICTORIAMETRICS_STORAGE_PATH',
      '/var/lib/bundlephobia-victoriametrics',
    ),
    scrapeConfig: getValue(
      'VICTORIAMETRICS_SCRAPE_CONFIG',
      '/etc/bundlephobia-victoriametrics/promscrape.yml',
    ),
    listenAddr: getValue('VICTORIAMETRICS_LISTEN_ADDR', '127.0.0.1:8428'),
    retention: getValue('VICTORIAMETRICS_RETENTION', '30d'),
    memoryAllowedBytes: getValue(
      'VICTORIAMETRICS_MEMORY_ALLOWED_BYTES',
      '256MiB',
    ),
    minFreeDiskSpaceBytes: getValue(
      'VICTORIAMETRICS_MIN_FREE_DISK_SPACE_BYTES',
      '1GiB',
    ),
    startupTimeoutMs: getNumber('VICTORIAMETRICS_STARTUP_TIMEOUT_MS', 30000),
    idleTimeoutMs: getNumber('STATS_IDLE_TIMEOUT_MS', 30 * 60 * 1000),
  }
}

class VictoriaMetricsService {
  private readonly config = getConfig(process.env)
  private running: RunningVictoriaMetrics | undefined
  private starting: Promise<RunningVictoriaMetrics> | undefined
  private stopping: Promise<void> | undefined
  private idleTimer: NodeJS.Timeout | undefined
  private activeRequests = 0
  private child: ChildProcess | undefined

  constructor() {
    process.once('exit', () => this.child?.kill('SIGTERM'))
  }

  async acquire(): Promise<RunningVictoriaMetrics> {
    this.activeRequests += 1
    clearTimeout(this.idleTimer)

    try {
      if (this.stopping) await this.stopping

      if (!this.running) {
        this.starting ??= this.start().finally(() => {
          this.starting = undefined
        })
        this.running = await this.starting
      }

      return this.running
    } catch (error) {
      this.release()
      throw error
    }
  }

  release(): void {
    this.activeRequests -= 1

    if (this.activeRequests > 0 || !this.running) return

    clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      if (this.activeRequests > 0 || !this.running) return

      const { child } = this.running
      this.running = undefined
      this.stopping = stopChild(child).finally(() => {
        this.stopping = undefined

        if (this.child === child) this.child = undefined
      })
    }, this.config.idleTimeoutMs)
    this.idleTimer.unref()
  }

  private async start(): Promise<RunningVictoriaMetrics> {
    await mkdir(this.config.storagePath, { recursive: true })

    const child = spawn(
      this.config.binary,
      [
        '-storageDataPath=' + this.config.storagePath,
        '-promscrape.config=' + this.config.scrapeConfig,
        '-promscrape.configCheckInterval=10s',
        '-promscrape.maxScrapeSize=16MiB',
        '-retentionPeriod=' + this.config.retention,
        '-httpListenAddr=' + this.config.listenAddr,
        '-http.pathPrefix=' + PATH_PREFIX,
        '-memory.allowedBytes=' + this.config.memoryAllowedBytes,
        '-storage.minFreeDiskSpaceBytes=' + this.config.minFreeDiskSpaceBytes,
        '-loggerLevel=WARN',
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    )

    this.child = child

    try {
      await waitUntilReady(child, this.config)
    } catch (error) {
      await stopChild(child)

      if (this.child === child) this.child = undefined
      throw error
    }

    return { origin: 'http://' + this.config.listenAddr, child }
  }
}

async function waitUntilReady(
  child: ChildProcess,
  config: VictoriaMetricsConfig,
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
      const response = await fetch(
        'http://' + config.listenAddr + PATH_PREFIX + '/-/ready',
        { signal: AbortSignal.timeout(500) },
      )

      if (response.ok) return
    } catch {
      // Wait for VictoriaMetrics to open its HTTP listener.
    }

    await delay(200)
  }

  throw new Error('VictoriaMetrics did not become ready before the timeout')
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return

  const exited = new Promise<void>(resolve =>
    child.once('exit', () => resolve()),
  )

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

const victoriaMetrics = new VictoriaMetricsService()

export async function proxyStatsRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  let active: RunningVictoriaMetrics

  try {
    active = await victoriaMetrics.acquire()
  } catch (error) {
    console.error('Unable to start VictoriaMetrics:', error)
    response.writeHead(503, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Retry-After': '5',
    })
    response.end('Stats is starting. Retry in a few seconds.')

    return
  }

  await new Promise<void>(resolve => {
    let completed = false

    const finish = () => {
      if (completed) return

      completed = true
      victoriaMetrics.release()
      resolve()
    }

    response.once('finish', finish)
    response.once('close', finish)

    statsProxy.web(request, response, { target: active.origin }, error => {
      if (!error) return

      console.error('Unable to proxy VictoriaMetrics stats request:', error)

      if (!response.headersSent) {
        response.writeHead(502, {
          'Content-Type': 'text/plain; charset=utf-8',
        })
        response.end('VictoriaMetrics is unavailable.')
      } else {
        response.destroy(error)
      }

      finish()
    })
  })
}

export function redirectStatsRequest(path: string): string | undefined {
  if (path === PATH_PREFIX || path === PATH_PREFIX + '/') {
    return PATH_PREFIX + '/vmui/'
  }

  return undefined
}
