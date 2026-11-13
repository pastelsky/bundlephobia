import { selectManifestPaths } from './paths.mjs'
import { loadManifests, observeManifests } from './manifests.mjs'

async function scanRepository(github, source, options, notes) {
  const [owner, repo] = source.repo.split('/')
  const metadata = await github('GET /repos/{owner}/{repo}', { owner, repo })

  if (
    metadata.private ||
    metadata.fork ||
    metadata.archived ||
    metadata.stargazers_count < options.minimumStars ||
    metadata.pushed_at < options.activeSince
  )
    return []

  if (
    /(?:^|[-/ ])(?:awesome|boilerplate|starter|tutorial|template|benchmarks?)(?:[-/ ]|$)/i.test(
      `${source.repo} ${metadata.description ?? ''}`,
    )
  )
    return []

  const commit = await github('GET /repos/{owner}/{repo}/commits/{ref}', {
    owner,
    repo,
    ref: metadata.default_branch,
  })

  const tree = await github('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
    owner,
    repo,
    tree_sha: commit.sha,
    recursive: '1',
  })

  if (tree.truncated)
    throw new Error(`Truncated repository tree: ${source.repo}`)

  const entries = selectManifestPaths(tree, source, options, notes)
  const manifests = await loadManifests(github, source.repo, entries)

  return observeManifests(manifests, {
    repo: source.repo,
    sha: commit.sha,
    frameworks: options.frameworks,
  })
}

export async function scanRepositories(github, repositories, options, notes) {
  const observations = []

  for (const repo of repositories) {
    try {
      observations.push(...(await scanRepository(github, repo, options, notes)))
    } catch (error) {
      notes.push(`Repository unavailable: ${repo.repo}: ${error.message}`)
    }
  }

  return observations
}
