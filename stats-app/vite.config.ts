import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  css: { modules: { localsConvention: 'camelCaseOnly' } },
  base: '/stats/dashboard/',
  build: {
    outDir: '../client/assets/public/stats/dashboard',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/stats/api/': 'http://127.0.0.1:8428',
    },
  },
})
