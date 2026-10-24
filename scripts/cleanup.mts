import fs from 'node:fs'
import path from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'

const executeFile = promisify(execFile)

function removalArgs(paths: string[]) {
  for (const filename of paths) {
    const resolved = path.resolve(filename)

    if (resolved === path.parse(resolved).root) {
      throw new Error('Refusing to remove a filesystem root')
    }
  }

  return ['-c', '3', 'rm', '-rf', '--', ...paths]
}

function missingExecutable(error: Error) {
  return 'code' in error && error.code === 'ENOENT'
}

// Isolate deletion so active application work keeps its normal I/O priority.
export async function removePaths(paths: string[]) {
  if (paths.length === 0) return

  if (process.platform === 'linux') {
    try {
      await executeFile('ionice', removalArgs(paths))

      return
    } catch (error) {
      if (!(error instanceof Error) || !missingExecutable(error)) throw error
    }
  }

  await Promise.all(
    paths.map(filename =>
      fs.promises.rm(filename, {
        recursive: true,
        force: true,
      }),
    ),
  )
}

export function removePathSync(filename: string, filesystem = fs) {
  if (process.platform === 'linux' && filesystem === fs) {
    try {
      execFileSync('ionice', removalArgs([filename]), { stdio: 'pipe' })

      return
    } catch (error) {
      if (!(error instanceof Error) || !missingExecutable(error)) throw error
    }
  }

  filesystem.rmSync(filename, { recursive: true, force: true })
}
