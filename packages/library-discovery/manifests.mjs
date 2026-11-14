import npa from 'npm-package-arg'
import validatePackageName from 'validate-npm-package-name'
import { matchesGlob } from 'node:path'

export function dependencyNames(
  manifest,
  fields = ['dependencies', 'devDependencies', 'optionalDependencies'],
) {
  const names = new Set()

  for (const field of fields) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      try {
        const parsed = npa.resolve(name, spec)
        const dependency = parsed.type === 'alias' ? parsed.subSpec : parsed

        if (
          dependency.registry &&
          validatePackageName(dependency.name).validForNewPackages
        )
          names.add(dependency.name)
      } catch {
        // Invalid, workspace-only and non-registry declarations are not npm candidates.
      }
    }
  }

  return names
}

export function isWebApplication(manifest, frameworks = []) {
  if (manifest.private !== true) return false
  const dependencies = dependencyNames(manifest)
  const framework = frameworks.some(name => dependencies.has(name))

  return Object.entries(manifest.scripts ?? {}).some(
    ([name, command]) =>
      /^(dev|build|start)(?::|$)/.test(name) &&
      (framework ||
        /(?:vite|nuxt|next|svelte-kit|astro|ng |webpack|react-scripts)/.test(
          command,
        )),
  )
}

const webPath = /(?:^|\/)(?:apps?|web|frontend|client|ui|site)(?:\/|$)/

const serverPath =
  /(?:^|\/)(?:server|backend|api|cli|desktop|mobile|worker)(?:\/|$)/

export function selectManifestPaths(tree, source, options, notes) {
  const paths = new Map(
    tree.tree
      .filter(
        entry =>
          entry.type === 'blob' &&
          (entry.path === 'package.json' ||
            entry.path.endsWith('/package.json')) &&
          !matchesGlob(
            entry.path,
            '**/{node_modules,vendor,examples,fixtures,tests,docs,storybook,.*}/**',
          ) &&
          !serverPath.test(entry.path),
      )
      .map(entry => [entry.path, entry]),
  )

  const preferred = [
    ...new Set([
      ...source.paths,
      'package.json',
      ...[...paths.keys()].filter(path => webPath.test(path)).sort(),
    ]),
  ]

  const selected = preferred.filter(path => paths.has(path))

  if (selected.length > options.manifestsPerRepository)
    notes.push(
      `Manifest budget reached: ${source.repo} (${options.manifestsPerRepository}/${selected.length})`,
    )

  return selected
    .slice(0, options.manifestsPerRepository)
    .map(path => paths.get(path))
}

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

export function observeManifests(manifests, { repo, sha, stars, frameworks }) {
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

    for (const name of runtime) {
      if (internal.has(name)) queue.add(internal.get(name))
      else
        observations.push({
          package: name,
          runtime: true,
          repo,
          stars,
          owner: repo.split('/')[0].toLowerCase(),
          manifest: `https://github.com/${repo}/blob/${sha}/${path}`,
        })
    }

    // Workspace specs deliberately aren't registry packages; follow the loaded local manifests instead.
    for (const field of ['dependencies', 'optionalDependencies']) {
      for (const name of Object.keys(manifest[field] ?? {}))
        if (internal.has(name)) queue.add(internal.get(name))
    }
  }

  return observations
}
