import { dependencyNames, isWebApplication } from './dependencies.mjs'

async function readManifest(github, repo, entry) {
  const blob = await github('GET /repos/{owner}/{repo}/git/blobs/{file_sha}', {
    owner: repo.split('/')[0],
    repo: repo.split('/')[1],
    file_sha: entry.sha,
  })

  if (blob.size > 1_000_000 || blob.encoding !== 'base64')
    throw new Error(`Unsupported manifest ${repo}/${entry.path}`)

  return JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'))
}

export async function loadManifests(github, repo, entries) {
  const manifests = new Map()

  for (const entry of entries)
    manifests.set(entry.path, await readManifest(github, repo, entry))

  return manifests
}

export function observeManifests(manifests, { repo, sha, frameworks }) {
  const internal = new Map(
    [...manifests].map(([path, manifest]) => [manifest.name, path]),
  )

  const queue = [...manifests.keys()].filter(path =>
    isWebApplication(manifests.get(path), frameworks),
  )

  const visited = new Set()
  const observations = []

  while (queue.length) {
    const path = queue.shift()

    if (visited.has(path)) continue
    visited.add(path)
    const manifest = manifests.get(path)

    const runtime = dependencyNames(manifest, [
      'dependencies',
      'optionalDependencies',
    ])

    for (const name of dependencyNames(manifest)) {
      if (internal.has(name)) queue.push(internal.get(name))
      else
        observations.push({
          package: name,
          runtime: runtime.has(name),
          repo,
          owner: repo.split('/')[0].toLowerCase(),
          manifest: `https://github.com/${repo}/blob/${sha}/${path}`,
        })
    }

    // Workspace specs deliberately aren't registry packages; follow the loaded local manifests instead.
    for (const field of ['dependencies', 'devDependencies']) {
      for (const name of Object.keys(manifest[field] ?? {}))
        if (internal.has(name)) queue.push(internal.get(name))
    }
  }

  return observations
}
