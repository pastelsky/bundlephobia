const CANONICAL_REPOSITORIES: Record<string, string> = {
  'react/react': 'facebook/react',
  'reactjs/redux': 'reduxjs/redux',
  'snowpackjs/astro': 'withastro/astro',
  'zeit/next.js': 'vercel/next.js',
}

export function canonicalGithubRepository(repository: string): string {
  return CANONICAL_REPOSITORIES[repository] || repository
}
