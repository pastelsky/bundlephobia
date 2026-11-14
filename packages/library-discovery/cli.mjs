import { createDiscoveryClients } from './http.mjs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { request } from '@octokit/request'
import { discoverLibraries } from './index.mjs'
import { readState } from './catalog.mjs'
import catalog from '../../utils/similar-packages.catalog.json' with { type: 'json' }
import groups from '../../utils/similar-packages.groups.json' with { type: 'json' }

const output =
  process.env.LIBRARY_DISCOVERY_OUTPUT ??
  '/tmp/gh-aw/agent/library-discovery.json'

const statePath =
  process.env.LIBRARY_DISCOVERY_STATE ??
  '/tmp/gh-aw/repo-memory/library-discovery/state.json'

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/')

const githubRequest = request.defaults({
  headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
  request: { timeout: 20000 },
})

const { github, registry } = createDiscoveryClients({ githubRequest })

let state

try {
  state = readState(JSON.parse(await readFile(statePath, 'utf8')))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  state = readState()
}

let pendingCatalog = {}

try {
  const pending = await github('GET /repos/{owner}/{repo}/contents/{path}', {
    owner,
    repo,
    path: 'utils/similar-packages.catalog.json',
    ref: 'codex/library-catalog',
  })

  pendingCatalog = JSON.parse(
    Buffer.from(pending.content, 'base64').toString('utf8'),
  )
} catch (error) {
  if (error.status !== 404) throw error
}

const excludedPackages = Object.values(groups).flatMap(group => group.packages)

const result = await discoverLibraries({
  github,
  registry,
  catalog,
  pendingCatalog,
  excludedPackages,
  frameworks: groups.frameworks.packages,
  state,
})

await mkdir(dirname(output), { recursive: true })

await writeFile(output, `${JSON.stringify(result.report, null, 2)}\n`)

// A preview can point at saved state while leaving it unchanged.
if (!process.argv.includes('--dry-run')) {
  await mkdir(dirname(statePath), { recursive: true })
  await writeFile(
    `${statePath}.tmp`,
    `${JSON.stringify(result.state, null, 2)}\n`,
  )
  await rename(`${statePath}.tmp`, statePath)
}

console.log(
  JSON.stringify({
    output,
    coverage: result.report.coverage,
    candidates: result.report.candidates.length,
    warnings: result.report.notes.length,
  }),
)
