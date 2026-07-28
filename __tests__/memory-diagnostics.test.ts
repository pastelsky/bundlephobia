const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createMemoryDiagnostics,
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
      writeReport: filename => fs.writeFileSync(filename, '{}'),
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
})
