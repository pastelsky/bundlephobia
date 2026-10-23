import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { test, expect } from '@playwright/test'

test('replays real builds with native traces and externally sampled memory', async () => {
  test.skip(
    process.platform !== 'linux',
    'External /proc sampling requires Linux',
  )
  test.setTimeout(60000)

  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'build-profile-test-'),
  )

  let subscriptions = 0

  const server = createServer((request, response) => {
    if (request.method === 'DELETE') {
      subscriptions--
      response.writeHead(204).end()

      return
    }

    subscriptions++
    response.setHeader('content-type', 'application/json')
    response.end(
      JSON.stringify({
        packageString: 'is-number@7.0.0',
        packageName: 'is-number',
        installPath: process.cwd(),
        packagePath: path.join(process.cwd(), 'node_modules/is-number'),
        subscriptionId: 'test-lease',
      }),
    )
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = z.object({ port: z.number() }).parse(server.address())

  const replay = (output: string, extra: string[]) =>
    new Promise<number | null>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--experimental-strip-types',
          'scripts/profile-build.ts',
          'is-number@7.0.0',
          '--endpoint',
          `http://127.0.0.1:${address.port}`,
          '--output',
          output,
          ...extra,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )

      let errors = ''
      child.stdout.resume()
      child.stderr.on('data', data => {
        errors += data
      })
      child.once('error', reject)
      child.once('exit', code => {
        if (code !== 0 && !extra.includes('--max-rss-mb'))
          reject(new Error(errors))
        else resolve(code)
      })
    })

  try {
    const normal = path.join(directory, 'normal')
    expect(await replay(normal, ['--repeat', '2'])).toBe(0)
    expect(subscriptions).toBe(0)
    const files = await fs.readdir(normal)
    expect(files).toEqual(
      expect.arrayContaining([
        'rspack.log',
        'external-memory.json',
        'result-0.json',
        'result-1.json',
        'retained-1.json',
      ]),
    )
    expect(files.some(file => file.endsWith('.cpuprofile'))).toBe(true)
    expect(
      await fs.readFile(path.join(normal, 'rspack.log'), 'utf8'),
    ).toContain('Compilation:code_generation')

    const memory = JSON.parse(
      await fs.readFile(path.join(normal, 'external-memory.json'), 'utf8'),
    )

    expect(memory.samples.length).toBeGreaterThan(0)
    expect(memory.samples[0].rssBytes).toBeGreaterThan(0)

    const metricFile = files.find(
      file => file.includes('-size-') && file.endsWith('.json'),
    )

    if (!metricFile) throw new Error('Missing correlated build metrics')

    const metrics = JSON.parse(
      await fs.readFile(path.join(normal, metricFile), 'utf8'),
    )

    expect(
      metrics.phaseMarks.some(
        (phase: { event: string }) => phase.event === 'TASK_PACKAGE_COMPILE',
      ),
    ).toBe(true)

    const stopped = path.join(directory, 'stopped')
    expect(await replay(stopped, ['--max-rss-mb', '1'])).toBe(1)

    const stoppedMemory = JSON.parse(
      await fs.readFile(path.join(stopped, 'external-memory.json'), 'utf8'),
    )

    expect(stoppedMemory.stoppedBecause).toBe('RSS limit')
    expect(subscriptions).toBe(0)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    )
    await fs.rm(directory, { recursive: true, force: true })
  }
})
