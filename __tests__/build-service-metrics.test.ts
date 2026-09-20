import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { isExpensiveBuild, measureBuild } from '../build-service/metrics.js'

const baseMetrics = {
  status: 'success',
  durationMs: 100,
  peakRssBytes: 100 * 1024 * 1024,
  cpuMs: 100,
  diskUsedDeltaBytes: 0,
}

describe('build-service metrics thresholds', () => {
  it('does not classify ordinary builds as expensive', () => {
    expect(isExpensiveBuild(baseMetrics)).toBe(false)
  })

  it('classifies failed builds regardless of cost', () => {
    expect(isExpensiveBuild({ ...baseMetrics, status: 'error' })).toBe(true)
  })

  it('classifies slow and memory-heavy builds', () => {
    expect(isExpensiveBuild({ ...baseMetrics, durationMs: 10_000 })).toBe(true)
    expect(
      isExpensiveBuild({
        ...baseMetrics,
        peakRssBytes: 512 * 1024 * 1024,
      }),
    ).toBe(true)
  })

  it('logs metrics for failed builds with package and operation context', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const metricsDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'bundlephobia-build-metrics-'),
    )

    const previousMetricsDirectory = process.env.BUILD_METRICS_DIR
    process.env.BUILD_METRICS_DIR = metricsDirectory

    const error = Object.assign(new Error('install failed'), {
      code: 'INSTALL_FAILED',
    })

    try {
      await expect(
        measureBuild({
          operation: 'size',
          packageString: '@example/package@1.0.0',
          run: async () => {
            throw error
          },
        }),
      ).rejects.toBe(error)

      expect(warn).toHaveBeenCalledWith(
        'BUILD_METRICS',
        expect.objectContaining({
          package: '@example/package@1.0.0',
          operation: 'size',
          status: 'error',
          errorName: 'Error',
          errorCode: 'INSTALL_FAILED',
          peakRssMb: expect.any(Number),
          rssAfterMb: expect.any(Number),
          rssRetainedMb: expect.any(Number),
          processCountAtPeak: expect.any(Number),
          processCountAtEnd: expect.any(Number),
          artifactPath: expect.stringContaining(metricsDirectory),
        }),
      )

      const artifactPath = warn.mock.calls[0][1].artifactPath
      const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'))
      expect(artifact.processesAtEnd).toEqual(expect.any(Array))
      expect(artifact).toEqual(
        expect.objectContaining({ package: '@example/package@1.0.0' }),
      )
    } finally {
      if (previousMetricsDirectory === undefined) {
        delete process.env.BUILD_METRICS_DIR
      } else {
        process.env.BUILD_METRICS_DIR = previousMetricsDirectory
      }

      warn.mockRestore()
      await fs.rm(metricsDirectory, { recursive: true, force: true })
    }
  })
})
