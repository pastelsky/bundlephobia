import { dependencyNames, isWebApplication } from './dependencies.mjs'

export async function loadManifests(github, repository, entries) {
  const [owner, repo] = repository.split('/')
  const manifests = new Map()

  for (const entry of entries) {
    const blob = await github(
      'GET /repos/{owner}/{repo}/git/blobs/{file_sha}',
      {
        owner,
        repo,
        file_sha: entry.sha,
      },
    )

    if (blob.size > 1_000_000 || blob.encoding !== 'base64')
      throw new Error(`Unsupported manifest ${repository}/${entry.path}`)
    manifests.set(
      entry.path,
      JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8')),
    )
  }

  return manifests
}

export function observeManifests(manifests, { repo, sha, frameworks }) {
  const internal = new Map(
    [...manifests].map(([path, manifest]) => [manifest.name, path]),
  )

  const queue = new Set(
    [...manifests.keys()].filter(path =>
      isWebApplication(manifests.get(path), frameworks),
    ),
  )

  const observations = []

  for (const path of queue) {
    const manifest = manifests.get(path)

    const runtime = dependencyNames(manifest, [
      'dependencies',
      'optionalDependencies',
    ])

    for (const name of dependencyNames(manifest)) {
      if (internal.has(name)) queue.add(internal.get(name))
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
    for (const field of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
    ]) {
      for (const name of Object.keys(manifest[field] ?? {}))
        if (internal.has(name)) queue.add(internal.get(name))
    }
  }

  return observations
}
