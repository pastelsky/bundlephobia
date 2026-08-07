import { defineConfig, globalIgnores } from 'eslint/config'
import nextConfig from 'eslint-config-next'
import prettier from 'eslint-config-prettier/flat'

export default defineConfig([
  ...nextConfig,
  prettier,
  {
    rules: {
      // Client-only state is synchronized after hydration in these components.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
])
