import { Readable } from 'node:stream'
import { extractPackumentMetadataFromStream } from '../server/clients/npm-packument-stream'

function streamFromBuffers(buffers: Buffer[]): NodeJS.ReadableStream {
  return Readable.from(buffers)
}

function streamFromString(
  content: string,
  chunkSize = 16,
): NodeJS.ReadableStream {
  const buf = Buffer.from(content, 'utf8')
  const chunks: Buffer[] = []

  for (let i = 0; i < buf.length; i += chunkSize) {
    chunks.push(buf.subarray(i, i + chunkSize))
  }

  return Readable.from(chunks)
}

describe('DFA Zero-Decode Packument Stream Extractor', () => {
  it('extracts dist-tags, time, and repository from standard JSON', async () => {
    const json = JSON.stringify({
      _id: 'sample-package',
      name: 'sample-package',
      'dist-tags': { latest: '2.0.0', next: '3.0.0-alpha.1' },
      versions: {
        '1.0.0': { name: 'sample-package', version: '1.0.0' },
        '2.0.0': { name: 'sample-package', version: '2.0.0' },
      },
      time: {
        created: '2024-01-01T00:00:00.000Z',
        modified: '2024-02-01T00:00:00.000Z',
        '1.0.0': '2024-01-02T00:00:00.000Z',
        '2.0.0': '2024-02-01T00:00:00.000Z',
      },
      repository: {
        type: 'git',
        url: 'git+https://github.com/example/sample-package.git',
      },
      readme: '# Sample Package Documentation',
    })

    const result = await extractPackumentMetadataFromStream(
      streamFromString(json, 32),
      { abortStreamWhenAllTargetsFound: false },
    )

    expect(result.distTags).toEqual({
      latest: '2.0.0',
      next: '3.0.0-alpha.1',
    })
    expect(result.time).toEqual({
      created: '2024-01-01T00:00:00.000Z',
      modified: '2024-02-01T00:00:00.000Z',
      '1.0.0': '2024-01-02T00:00:00.000Z',
      '2.0.0': '2024-02-01T00:00:00.000Z',
    })
    expect(result.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/example/sample-package.git',
    })
  })

  it('handles completely unordered keys (e.g. time first, versions middle, dist-tags last)', async () => {
    const json = JSON.stringify({
      time: {
        '1.0.0': '2024-01-01T00:00:00.000Z',
      },
      versions: {
        '1.0.0': { name: 'unordered-pkg' },
      },
      repository: {
        type: 'git',
        url: 'https://github.com/example/unordered.git',
      },
      'dist-tags': {
        latest: '1.0.0',
      },
    })

    const result = await extractPackumentMetadataFromStream(
      streamFromString(json, 8),
    )

    expect(result.time).toEqual({ '1.0.0': '2024-01-01T00:00:00.000Z' })
    expect(result.distTags).toEqual({ latest: '1.0.0' })
    expect(result.repository).toEqual({
      type: 'git',
      url: 'https://github.com/example/unordered.git',
    })
  })

  it('handles pretty-printed and unminified JSON with spaces, tabs, and newlines', async () => {
    const prettyJson = `
    {
      "name" : "pretty-package" ,
      "repository"  :\t {
        "type" : "git" ,
        "url" : "https://github.com/example/pretty.git"
      } ,
      "versions" : {
        "1.0.0" : {
          "description" : "Contains fake \\"time\\" : { \\"fake\\": 123 }"
        }
      } ,
      "time"  :\n\t{
        "created" : "2024-01-01" ,
        "1.0.0" : "2024-01-02"
      } ,
      "dist-tags" :\t {
        "latest" : "1.0.0"
      }
    }
    `

    const result = await extractPackumentMetadataFromStream(
      streamFromString(prettyJson, 10),
    )

    expect(result.distTags).toEqual({ latest: '1.0.0' })
    expect(result.time).toEqual({
      created: '2024-01-01',
      '1.0.0': '2024-01-02',
    })
    expect(result.repository).toEqual({
      type: 'git',
      url: 'https://github.com/example/pretty.git',
    })
  })

  it('handles string and null repository representations', async () => {
    const stringRepoJson = JSON.stringify({
      repository: 'https://github.com/example/string-repo.git',
      time: { '1.0.0': '2024-01-01' },
      'dist-tags': { latest: '1.0.0' },
    })

    const stringResult = await extractPackumentMetadataFromStream(
      streamFromString(stringRepoJson, 12),
    )

    expect(stringResult.repository).toEqual(
      'https://github.com/example/string-repo.git',
    )

    const nullRepoJson = JSON.stringify({
      repository: null,
      time: { '1.0.0': '2024-01-01' },
      'dist-tags': { latest: '1.0.0' },
    })

    const nullResult = await extractPackumentMetadataFromStream(
      streamFromString(nullRepoJson, 12),
    )

    expect(nullResult.repository).toBeNull()
  })

  it('handles chunk boundaries splitting inside the target key', async () => {
    // Specifically split "time": into "ti" and "me":
    const chunk1 = Buffer.from('{"name":"test","versions":{')
    const chunk2 = Buffer.from('"1.0.0":{}},"ti')
    const chunk3 = Buffer.from('me":{"1.0.0":"2026-01-01T00:00:00.000Z"}}')

    const result = await extractPackumentMetadataFromStream(
      streamFromBuffers([chunk1, chunk2, chunk3]),
    )

    expect(result.time).toEqual({
      '1.0.0': '2026-01-01T00:00:00.000Z',
    })
  })

  it('handles chunk boundaries splitting inside the opening brace', async () => {
    // Specifically split after "time": and before {
    const chunk1 = Buffer.from('{"name":"test","time":')
    const chunk2 = Buffer.from('{"1.0.0":"2026-01-01T00:00:00.000Z"}}')

    const result = await extractPackumentMetadataFromStream(
      streamFromBuffers([chunk1, chunk2]),
    )

    expect(result.time).toEqual({
      '1.0.0': '2026-01-01T00:00:00.000Z',
    })
  })

  it('ignores false-positive keys appearing inside string literals', async () => {
    const json = JSON.stringify({
      name: 'tricky-package',
      description:
        'This package mentions "time":{ "fake": "version" } and "dist-tags":{ "fake": "latest" } in text',
      'dist-tags': { latest: '1.0.0' },
      versions: {
        '1.0.0': {
          name: 'tricky-package',
          description: 'another "time":{ "nested": "string" } occurrence',
        },
      },
      time: {
        '1.0.0': '2026-01-01T00:00:00.000Z',
      },
    })

    const result = await extractPackumentMetadataFromStream(
      streamFromString(json, 24),
    )

    expect(result.distTags).toEqual({ latest: '1.0.0' })
    expect(result.time).toEqual({
      '1.0.0': '2026-01-01T00:00:00.000Z',
    })
  })

  it('correctly parses braces and escaped quotes inside string values of time', async () => {
    const json = JSON.stringify({
      time: {
        created: '2026-01-01T00:00:00.000Z',
        'tagged{version}': '2026-01-02T00:00:00.000Z',
        'complex"quote': '2026-01-03T00:00:00.000Z',
      },
    })

    const result = await extractPackumentMetadataFromStream(
      streamFromString(json, 15),
    )

    expect(result.time).toEqual({
      created: '2026-01-01T00:00:00.000Z',
      'tagged{version}': '2026-01-02T00:00:00.000Z',
      'complex"quote': '2026-01-03T00:00:00.000Z',
    })
  })

  it('handles tiny 3-byte chunk fragments (simulating fragmented network stream)', async () => {
    const json = JSON.stringify({
      name: 'fragmented-package',
      'dist-tags': { latest: '1.2.3' },
      versions: { '1.0.0': {}, '1.1.0': {}, '1.2.3': {} },
      time: {
        '1.0.0': '2024-01-01',
        '1.1.0': '2024-02-01',
        '1.2.3': '2024-03-01',
      },
    })

    const result = await extractPackumentMetadataFromStream(
      streamFromString(json, 3),
    )

    expect(result.distTags).toEqual({ latest: '1.2.3' })
    expect(result.time).toEqual({
      '1.0.0': '2024-01-01',
      '1.1.0': '2024-02-01',
      '1.2.3': '2024-03-01',
    })
  })

  it('returns empty objects gracefully when target keys are missing', async () => {
    const json = JSON.stringify({
      name: 'bare-package',
      description: 'A package without any time or dist-tags fields',
    })

    const result = await extractPackumentMetadataFromStream(
      streamFromString(json, 16),
    )

    expect(result.time).toBeUndefined()
    expect(result.distTags).toBeUndefined()
    expect(result.repository).toBeUndefined()
  })

  it('aborts the stream when abortStreamWhenAllTargetsFound is enabled', async () => {
    const json = JSON.stringify({
      'dist-tags': { latest: '1.0.0' },
      repository: { type: 'git', url: 'https://example.com' },
      time: { '1.0.0': '2026-01-01' },
      readme: 'A'.repeat(10000), // Huge trailing readme
    })

    const baseStream = streamFromString(json, 50)

    const result = await extractPackumentMetadataFromStream(baseStream, {
      abortStreamWhenAllTargetsFound: true,
    })

    expect(result.time).toEqual({ '1.0.0': '2026-01-01' })
    expect(baseStream.destroyed).toBe(true)
  })

  it('correctly handles target key being the final key in root object with null or string', async () => {
    // repository as null at end of object
    const jsonNull =
      '{"name":"pkg","time":{"1.0.0":"2026-01-01"},"dist-tags":{"latest":"1.0.0"},"repository":null}'

    const resultNull = await extractPackumentMetadataFromStream(
      streamFromString(jsonNull, 5),
    )

    expect(resultNull.repository).toBeNull()
    expect(resultNull.distTags).toEqual({ latest: '1.0.0' })
    expect(resultNull.time).toEqual({ '1.0.0': '2026-01-01' })

    // repository as string at end of object
    const jsonString =
      '{"time":{"1.0.0":"2026-01-01"},"repository":"https://github.com/example/repo.git"}'

    const resultString = await extractPackumentMetadataFromStream(
      streamFromString(jsonString, 7),
    )

    expect(resultString.repository).toEqual(
      'https://github.com/example/repo.git',
    )
    expect(resultString.time).toEqual({ '1.0.0': '2026-01-01' })
  })

  it('correctly handles skipped non-target primitive as final key in root object', async () => {
    const json =
      '{"time":{"1.0.0":"2026-01-01"},"dist-tags":{"latest":"1.0.0"},"repository":null,"unwanted":false}'

    const result = await extractPackumentMetadataFromStream(
      streamFromString(json, 8),
    )

    expect(result.time).toEqual({ '1.0.0': '2026-01-01' })
    expect(result.distTags).toEqual({ latest: '1.0.0' })
    expect(result.repository).toBeNull()
  })
})
