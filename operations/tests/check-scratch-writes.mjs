import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { scratchPolicy } from '../cleanup-scratch.mjs'

const root = path.resolve(process.argv[3])

const traceDirectory = process.argv[2]

const pathCalls = new Set([
  'mkdir',
  'mkdirat',
  'rmdir',
  'unlink',
  'unlinkat',
  'rename',
  'renameat',
  'renameat2',
  'symlink',
  'symlinkat',
  'link',
  'linkat',
  'truncate',
  'ftruncate',
  'chmod',
  'fchmod',
  'fchmodat',
  'fchmodat2',
  'chown',
  'lchown',
  'fchownat',
  'utime',
  'utimes',
  'utimensat',
  'mknod',
  'mknodat',
])

function decode(quoted) {
  // Unknown/abbreviated strings fail closed rather than silently escaping review.
  return JSON.parse(quoted)
}

function openedPath(call, argumentsText, result) {
  if (
    call !== 'creat' &&
    !/O_WRONLY|O_RDWR|O_CREAT|O_TRUNC|O_APPEND/.test(argumentsText)
  )
    return []
  const resolved = result.match(/^\d+<([^>]+)>/)
  assert.ok(
    resolved,
    `Writable descriptor has no decoded path: ${call}(${argumentsText}) = ${result}`,
  )

  return [resolved[1].replace(/ \(deleted\)$/, '')]
}

function pathnamePaths(call, argumentsText) {
  const relativePaths = [
    ...argumentsText.matchAll(
      /(?:AT_FDCWD|\d+)<([^>]+)>,\s*("(?:\\.|[^"\\])*")/g,
    ),
  ]

  if (relativePaths.length)
    return relativePaths.map(match => path.resolve(match[1], decode(match[2])))

  const quoted = [...argumentsText.matchAll(/"(?:\\.|[^"\\])*"/g)].map(match =>
    decode(match[0]),
  )

  const writes = call === 'symlink' ? quoted.slice(1) : quoted
  assert.ok(
    writes.length && writes.every(value => path.isAbsolute(value)),
    `Unresolved write path: ${call}(${argumentsText})`,
  )

  return writes
}

function pathsFor(call, argumentsText, result) {
  if (['open', 'openat', 'openat2', 'creat'].includes(call))
    return openedPath(call, argumentsText, result)

  if (!pathCalls.has(call)) return []

  if (call === 'ftruncate' || call === 'fchmod') {
    const descriptor = argumentsText.match(/^\d+<([^>]+)>/)
    assert.ok(descriptor, `Undecoded descriptor: ${call}(${argumentsText})`)

    return [descriptor[1].replace(/ \(deleted\)$/, '')]
  }

  return pathnamePaths(call, argumentsText)
}

function approved(location) {
  // /dev/null is an output sink, not retained package data.
  if (location === '/dev/null') return true

  if (location === root) return true
  const relative = path.relative(root, location)

  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    return false
  const first = relative.split(path.sep)[0]

  return (
    Object.hasOwn(scratchPolicy, first) || first === '.bundlephobia-disposable'
  )
}

function joinCalls(contents) {
  return contents.replace(
    /<unfinished \.\.\.>\n(?:---[^\n]*\n)*<\.\.\. \w+ resumed>/g,
    '',
  )
}

let writes = 0

const violations = []

function inspectLine(filename, line) {
  const match = line.match(/^(\w+)\((.*)\)\s+=\s+(.+)$/)

  if (!match) {
    const incomplete = line.match(/^(\w+)\(/)
    assert.ok(
      !incomplete || !pathCalls.has(incomplete[1]),
      `Unresolved mutation trace: ${line}`,
    )

    return
  }

  if (match[3].startsWith('-1')) return

  for (const location of pathsFor(match[1], match[2], match[3])) {
    writes++

    if (!approved(location)) violations.push({ filename, location, line })
  }
}

const traces = (await fs.readdir(traceDirectory)).filter(name =>
  name.startsWith('fs.'),
)

assert.ok(traces.length > 0, 'No syscall traces captured')

for (const filename of traces) {
  const contents = joinCalls(
    await fs.readFile(path.join(traceDirectory, filename), 'utf8'),
  )

  for (const line of contents.split('\n')) inspectLine(filename, line)
}

assert.ok(writes > 0, 'No successful mutating filesystem calls were inspected')

console.log(
  JSON.stringify(
    {
      tracedProcessesAndThreads: traces.length,
      inspectedWrites: writes,
      violations,
    },
    null,
    2,
  ),
)

assert.deepEqual(
  violations,
  [],
  'Builder or child process wrote outside the documented scratch policy',
)
