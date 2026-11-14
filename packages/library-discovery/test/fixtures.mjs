export const catalog = { search: { similar: ['existing'] } }

export const now = new Date('2026-11-14T12:00:00Z')

export const limits = { seeds: 1, searchPages: 1, repositories: 3 }

export function fakeSources() {
  const app = {
    private: true,
    scripts: { dev: 'vite' },
    devDependencies: { 'arbitrary-build-helper': '^1.0.0' },
    dependencies: {
      react: '^19.0.0',
      existing: '^1.0.0',
      fresh: '^1.0.0',
      pending: '^1.0.0',
    },
  }

  const server = {
    private: true,
    scripts: { dev: 'next dev' },
    dependencies: { react: '^19.0.0', 'server-only-package': '^1.0.0' },
  }

  const manifests = { root: app, backend: server }

  const github = async (route, args) => {
    if (route === 'GET /search/code')
      return {
        total_count: 3,
        items: ['alpha/app', 'beta/app', 'alpha/another-app'].map(repo => ({
          repository: { full_name: repo },
          path: 'package.json',
        })),
      }

    if (route === 'GET /search/repositories')
      return { total_count: 0, items: [] }

    if (route === 'GET /repos/{owner}/{repo}')
      return {
        fork: false,
        archived: false,
        stargazers_count: 1000,
        pushed_at: '2026-11-13T00:00:00Z',
        default_branch: 'main',
      }

    if (route === 'GET /repos/{owner}/{repo}/commits/{ref}')
      return { sha: 'pinned-commit' }

    if (route === 'GET /repos/{owner}/{repo}/git/trees/{tree_sha}')
      return {
        truncated: false,
        tree: [
          { path: 'package.json', type: 'blob', sha: 'root' },
          { path: 'apps/backend/package.json', type: 'blob', sha: 'backend' },
        ],
      }

    if (route === 'GET /repos/{owner}/{repo}/git/blobs/{file_sha}')
      return {
        size: 400,
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(manifests[args.file_sha])).toString(
          'base64',
        ),
      }
    throw new Error(`Unexpected GitHub call: ${route}`)
  }

  return { github, excludedPackages: ['react'] }
}
