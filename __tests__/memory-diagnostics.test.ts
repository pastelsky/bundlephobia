const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createMemoryDiagnostics,
  createRuntimeMetrics,
  getStartupEnvironment,
  parseBytes,
} = require('../scripts/memory-diagnostics.cjs')

describe('memory diagnostics', () => {
  let outputRoot

  beforeEach(() => {
    outputRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'bundlephobia-memory-diagnostics-')
    )
  })

  afterEach(() => {
    fs.rmSync(outputRoot, { recursive: true, force: true })
  })

  test('parses PM2-style byte values', () => {
    expect(parseBytes('425M')).toBe(425 * 1024 ** 2)
    expect(parseBytes('1G')).toBe(1024 ** 3)
    expect(() => parseBytes('425MB')).toThrow('Invalid byte value')
  })

  test('keeps one completed snapshot and skips captures during cooldown', () => {
    fs.mkdirSync(path.join(outputRoot, 'build-service'))
    fs.writeFileSync(
      path.join(
        outputRoot,
        'build-service',
        '.latest-interrupted.heapsnapshot'
      ),
      'partial'
    )
    const report = {
      excludeEnv: false,
      writeReport: (filename: string) => fs.writeFileSync(filename, '{}'),
    }
    const writeHeapSnapshot = filename => fs.writeFileSync(filename, 'snapshot')
    const diagnostics = createMemoryDiagnostics({
      service: 'build-service',
      thresholdBytes: 100,
      outputRoot,
      intervalMs: 60_000,
      minFreeBytes: 0,
      memoryUsage: () => ({ rss: 101, heapUsed: 10 }),
      report,
      writeHeapSnapshot,
      now: () => Date.parse('2026-07-28T00:00:00Z'),
      pid: 123,
      logger: { error: jest.fn() },
    })

    expect(diagnostics.check()).toBe(true)
    expect(report.excludeEnv).toBe(true)
    expect(
      fs.existsSync(
        path.join(
          outputRoot,
          'build-service',
          '.latest-interrupted.heapsnapshot'
        )
      )
    ).toBe(false)
    expect(
      fs.readFileSync(
        path.join(outputRoot, 'build-service', 'latest.heapsnapshot'),
        'utf8'
      )
    ).toBe('snapshot')
    expect(diagnostics.check()).toBe(false)
    expect(
      fs
        .readdirSync(path.join(outputRoot, 'build-service'))
        .filter(filename => filename.endsWith('.heapsnapshot'))
    ).toEqual(['latest.heapsnapshot'])
    diagnostics.stop()
  })

  test('does not capture below the configured RSS threshold', () => {
    const writeHeapSnapshot = jest.fn()
    const diagnostics = createMemoryDiagnostics({
      service: 'main',
      thresholdBytes: 100,
      outputRoot,
      intervalMs: 60_000,
      memoryUsage: () => ({ rss: 99 }),
      writeHeapSnapshot,
    })

    expect(diagnostics.check()).toBe(false)
    expect(writeHeapSnapshot).not.toHaveBeenCalled()
    diagnostics.stop()
  })

  test('captures a lightweight runtime timeline without a heap snapshot', () => {
    const runtimeMetrics = createRuntimeMetrics()
    runtimeMetrics.recordRequestStart()
    runtimeMetrics.recordRequestComplete({
      route: '/api/size',
      status: 200,
      durationMs: 25,
    })
    runtimeMetrics.registerProvider('main', () => ({
      queue: { ready: 2, running: 4 },
    }))
    const writeHeapSnapshot = jest.fn()
    const report = {
      excludeEnv: false,
      writeReport: (filename: string) => fs.writeFileSync(filename, '{}'),
    }
    const diagnostics = createMemoryDiagnostics({
      service: 'main',
      thresholdBytes: 100,
      outputRoot,
      intervalMs: 60_000,
      captureHeapSnapshot: false,
      memoryUsage: () => ({
        rss: 101,
        heapTotal: 20,
        heapUsed: 10,
        external: 5,
        arrayBuffers: 3,
      }),
      heapStatistics: () => ({ malloced_memory: 7 }),
      activeResourcesInfo: () => ['TCPSocketWrap', 'TCPSocketWrap'],
      runtimeMetrics,
      report,
      writeHeapSnapshot,
      now: () => Date.parse('2026-07-31T00:00:00Z'),
      pid: 456,
      logger: { error: jest.fn() },
    })

    expect(diagnostics.check()).toBe(true)
    expect(writeHeapSnapshot).not.toHaveBeenCalled()
    expect(
      fs.existsSync(path.join(outputRoot, 'main', 'latest.heapsnapshot'))
    ).toBe(false)

    const metadata = JSON.parse(
      fs.readFileSync(
        path.join(outputRoot, 'main', 'latest.metadata.json'),
        'utf8'
      )
    )
    expect(metadata.heapSnapshotCaptured).toBe(false)

    const capturedTimeline = JSON.parse(
      fs.readFileSync(
        path.join(outputRoot, 'main', 'latest.timeline.json'),
        'utf8'
      )
    )
    expect(capturedTimeline.samples).toHaveLength(1)
    expect(capturedTimeline.samples[0]).toMatchObject({
      memory: { rss: 101, external: 5, arrayBuffers: 3 },
      heap: { malloced_memory: 7 },
      activeResources: { TCPSocketWrap: 2 },
      runtime: {
        requests: {
          active: 0,
          started: 1,
          completed: 1,
          meanDurationMs: 25,
          maxDurationMs: 25,
          routes: { '/api/size': 1 },
          statuses: { '200': 1 },
        },
        providers: {
          main: { queue: { ready: 2, running: 4 } },
        },
      },
    })
    diagnostics.stop()
  })

  test('reads cluster environment from the PM2 startup payload', () => {
    expect(
      getStartupEnvironment({
        pm2_env: JSON.stringify({
          MEMORY_DIAGNOSTICS_SERVICE: 'build-service',
          MEMORY_DIAGNOSTICS_RSS_THRESHOLD: '850M',
        }),
      })
    ).toMatchObject({
      MEMORY_DIAGNOSTICS_SERVICE: 'build-service',
      MEMORY_DIAGNOSTICS_RSS_THRESHOLD: '850M',
    })
  })
})
