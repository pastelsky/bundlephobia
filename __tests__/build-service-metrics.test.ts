import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { isExpensiveBuild, measureBuild } from '../build-service/metrics.js'
import {
  activeBuilds,
  recordBuildPhase,
  startBuildTrace,
} from '../build-service/buildMemoryTrace.ts'

const baseMetrics = {
  status: 'success',
  durationMs: 100,
  peakRssBytes: 100 * 1024 * 1024,
  cpuMs: 100,
  diskUsedDeltaBytes: 0,
}

it('attributes interleaved library phase events to the right build', async () => {
  const first = startBuildTrace('size', 'first@1.0.0')
  const second = startBuildTrace('exports-sizes', 'second@1.0.0')

  try {
    await Promise.all([
      first.run(async () => {
        await Promise.resolve()
        recordBuildPhase('TASK_PACKAGE_COMPILE', { duration: 12 })
      }),
      second.run(async () => {
        await Promise.resolve()
        recordBuildPhase('TASK_PACKAGE_EXPORTS_SIZES', { duration: 20 })
      }),
    ])

    expect(first.phases.map(phase => phase.event)).toEqual([
      'TASK_PACKAGE_COMPILE',
    ])
    expect(second.phases.map(phase => phase.event)).toEqual([
      'TASK_PACKAGE_EXPORTS_SIZES',
    ])
    expect(first.phases[0].concurrentBuilds).toBe(2)
  } finally {
    first.finish()
    second.finish()
  }
})

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
            expect(activeBuilds()).toEqual([
              expect.objectContaining({
                package: '@example/package@1.0.0',
                operation: 'size',
              }),
            ])
            recordBuildPhase('TASK_PACKAGE_COMPILE', { duration: 12 })
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
      expect(artifact.phaseMarks).toEqual([
        expect.objectContaining({
          event: 'TASK_PACKAGE_COMPILE',
          durationMs: 12,
          concurrentBuilds: 1,
          rssBytes: expect.any(Number),
        }),
      ])
      expect(artifact.memorySamples[0]).toEqual(
        expect.objectContaining({
          elapsedMs: expect.any(Number),
          rssBytes: expect.any(Number),
          concurrentBuilds: expect.any(Number),
        }),
      )
      expect(activeBuilds()).toEqual([])
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

  it('retains the highest-cost artifacts instead of the newest artifacts', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const metricsDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'bundlephobia-build-metrics-ranked-'),
    )

    const previousMetricsDirectory = process.env.BUILD_METRICS_DIR
    const previousMaxArtifacts = process.env.BUILD_METRICS_MAX_ARTIFACTS
    process.env.BUILD_METRICS_DIR = metricsDirectory
    process.env.BUILD_METRICS_MAX_ARTIFACTS = '1'

    try {
      await fs.writeFile(
        path.join(metricsDirectory, 'existing.json'),
        JSON.stringify({
          package: '@existing/expensive@1.0.0',
          peakRssBytes: 999_999_999,
          rssRetainedBytes: 500_000_000,
          durationMs: 1,
          cpuMs: 1,
          diskUsedDeltaBytes: 0,
        }),
      )

      await expect(
        measureBuild({
          operation: 'size',
          packageString: '@example/cheap@1.0.0',
          run: async () => {
            throw new Error('cheap failure')
          },
        }),
      ).rejects.toThrow('cheap failure')

      expect(await fs.readdir(metricsDirectory)).toEqual(['existing.json'])
      expect(warn.mock.calls[0][1].artifactPath).toBeUndefined()
    } finally {
      if (previousMetricsDirectory === undefined) {
        delete process.env.BUILD_METRICS_DIR
      } else {
        process.env.BUILD_METRICS_DIR = previousMetricsDirectory
      }

      if (previousMaxArtifacts === undefined) {
        delete process.env.BUILD_METRICS_MAX_ARTIFACTS
      } else {
        process.env.BUILD_METRICS_MAX_ARTIFACTS = previousMaxArtifacts
      }

      warn.mockRestore()
      await fs.rm(metricsDirectory, { recursive: true, force: true })
    }
  })

  it('retains recent incidents even when old builds had higher absolute RSS', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const metricsDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'bundlephobia-build-metrics-recent-'),
    )

    const previousMetricsDirectory = process.env.BUILD_METRICS_DIR
    const previousMaxArtifacts = process.env.BUILD_METRICS_MAX_ARTIFACTS
    process.env.BUILD_METRICS_DIR = metricsDirectory
    process.env.BUILD_METRICS_MAX_ARTIFACTS = '2'

    try {
      for (const [year, peakRssBytes] of [
        [2020, 999_999_999],
        [2021, 888_888_888],
      ]) {
        await fs.writeFile(
          path.join(metricsDirectory, `${year}-old.json`),
          JSON.stringify({ peakRssBytes }),
        )
      }

      await expect(
        measureBuild({
          operation: 'size',
          packageString: '@example/recent@1.0.0',
          run: async () => {
            throw new Error('recent failure')
          },
        }),
      ).rejects.toThrow('recent failure')

      const files = await fs.readdir(metricsDirectory)
      expect(files).toHaveLength(2)
      expect(files).toContain('2020-old.json')
      expect(files).not.toContain('2021-old.json')
      expect(warn.mock.calls[0][1].artifactPath).toContain(metricsDirectory)
    } finally {
      if (previousMetricsDirectory === undefined) {
        delete process.env.BUILD_METRICS_DIR
      } else {
        process.env.BUILD_METRICS_DIR = previousMetricsDirectory
      }

      if (previousMaxArtifacts === undefined) {
        delete process.env.BUILD_METRICS_MAX_ARTIFACTS
      } else {
        process.env.BUILD_METRICS_MAX_ARTIFACTS = previousMaxArtifacts
      }

      warn.mockRestore()
      await fs.rm(metricsDirectory, { recursive: true, force: true })
    }
  })
})
