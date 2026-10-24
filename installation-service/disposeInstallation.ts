import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { promisify, types } from 'node:util'

const remove = promisify(execFile)

// Retire the owned tree before deletion: a cleanup child surviving a restart
// must never be able to remove a newly published installation at the old path.
export default async function disposeInstallation({
  installPath,
}: {
  installPath: string
}) {
  const retired = `${installPath}.deleting-${randomUUID()}`

  try {
    await fs.rename(installPath, retired)
  } catch (error) {
    if (
      types.isNativeError(error) &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return
    throw error
  }

  // POSIX production hosts: recursive deletion runs outside the installer's
  // filesystem pool and does not fan out across its four libuv workers.
  await remove('rm', ['-rf', '--', retired])
}
