import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import disposeInstallation from '../installation-service/disposeInstallation.ts'

it('removes a retired tree without following symlinks or deleting a replacement', async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'installation-disposal-'),
  )

  const installPath = path.join(root, 'owned tree')
  const outside = path.join(root, 'other owner')

  try {
    await fs.mkdir(installPath)
    await fs.writeFile(outside, 'keep')
    await fs.symlink(outside, path.join(installPath, 'link'))
    const renamed = Promise.withResolvers<void>()
    const proceed = Promise.withResolvers<void>()
    const rename = fs.rename

    const retirement = jest
      .spyOn(fs, 'rename')
      .mockImplementationOnce(async (from, to) => {
        await rename(from, to)
        renamed.resolve()
        await proceed.promise
      })

    const deleting = disposeInstallation({ installPath })
    await renamed.promise
    await fs.mkdir(installPath)
    await fs.writeFile(path.join(installPath, 'new'), 'replacement')
    proceed.resolve()
    await deleting
    retirement.mockRestore()
    expect(await fs.readFile(outside, 'utf8')).toBe('keep')
    expect(await fs.readdir(installPath)).toEqual(['new'])
    expect(
      (await fs.readdir(root)).some(name => name.includes('.deleting-')),
    ).toBe(false)
    await disposeInstallation({ installPath: path.join(root, 'missing') })
  } finally {
    jest.restoreAllMocks()
    await fs.rm(root, { recursive: true, force: true })
  }
})
