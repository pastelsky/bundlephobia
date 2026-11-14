import { matchesGlob } from 'node:path'

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
