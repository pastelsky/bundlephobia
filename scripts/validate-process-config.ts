import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

export type ProcessApp = {
  script: string
  block: string
  name?: string
  nodeArgs: string[]
}

export function parseProcessApps(contents: string): ProcessApp[] {
  const matches = [...contents.matchAll(/^  - script: (.+)$/gm)]

  return matches.map((match, index) => {
    const blockStart = match.index!
    const blockEnd = matches[index + 1]?.index ?? contents.length
    const block = contents.slice(blockStart, blockEnd)

    return {
      script: match[1].trim().replace(/^['"]|['"]$/g, ''),
      block,
      name: block.match(/^    name: (.+)$/m)?.[1]?.trim(),
      nodeArgs: [...block.matchAll(/^      - (.+)$/gm)].map(match =>
        match[1].trim().replace(/^['"]|['"]$/g, ''),
      ),
    }
  })
}

export function validateProcessContents(
  contents: string,
  root = repositoryRoot,
) {
  const apps = parseProcessApps(contents)
  const errors: string[] = []

  if (apps.length === 0)
    errors.push('process.yml does not define any applications')

  for (const app of apps) {
    if (!app.name) errors.push(`${app.script} is missing a process name`)

    const scriptPath = path.resolve(root, app.script)
    if (!fs.existsSync(scriptPath)) {
      errors.push(
        `${app.name ?? app.script} points to missing script ${app.script}`,
      )
      continue
    }

    if (path.extname(scriptPath) === '.ts') {
      if (!app.block.includes('--experimental-strip-types')) {
        errors.push(
          `${app.name ?? app.script} runs TypeScript without --experimental-strip-types`,
        )
      }

      const syntaxCheck = spawnSync(
        process.execPath,
        ['--experimental-strip-types', '--check', scriptPath],
        { encoding: 'utf8' },
      )
      if (syntaxCheck.status !== 0) {
        errors.push(
          `${app.name ?? app.script} failed Node syntax validation: ${syntaxCheck.stderr.trim()}`,
        )
      }
    }
  }

  return { apps, errors }
}

export function validateProcessConfig({
  configPath = path.join(repositoryRoot, 'process.yml'),
  root = repositoryRoot,
}: {
  configPath?: string
  root?: string
} = {}) {
  return validateProcessContents(fs.readFileSync(configPath, 'utf8'), root)
}
