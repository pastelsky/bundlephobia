const CANONICAL_REPOSITORIES: Record<string, string> = {
  'react/react': 'facebook/react',
  'reactjs/redux': 'reduxjs/redux',
  'zeit/next.js': 'vercel/next.js',
  'snowpackjs/astro': 'withastro/astro',
}

export function canonicalGithubRepository(repository: string): string {
  return CANONICAL_REPOSITORIES[repository] || repository
}
