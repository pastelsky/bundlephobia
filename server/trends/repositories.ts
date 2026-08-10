const CANONICAL_REPOSITORIES: Record<string, string> = {
  'react/react': 'facebook/react',
  'reactjs/redux': 'reduxjs/redux',
  'snowpackjs/astro': 'withastro/astro',
  'zeit/next.js': 'vercel/next.js',
}

const HISTORY_FALLBACKS: Record<string, string[]> = {
  'angular/core': ['angular/angular'],
  'facebook/react': ['react/react'],
  'react/react': ['facebook/react'],
  'reduxjs/redux': ['reactjs/redux'],
  'vercel/next.js': ['zeit/next.js'],
  'vuejs/core': ['vuejs/vue'],
  'vuejs/vue': ['vuejs/core'],
}

export function canonicalGithubRepository(repository: string): string {
  return CANONICAL_REPOSITORIES[repository] || repository
}

export function githubHistoryFallbacks(repository: string): string[] {
  return HISTORY_FALLBACKS[repository] || []
}
