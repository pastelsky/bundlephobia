import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './node_modules/@tremor/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter Variable', 'sans-serif'] },
      colors: {
        tremor: {
          brand: {
            faint: '#fff7ed',
            muted: '#fed7aa',
            subtle: '#fdba74',
            DEFAULT: '#ea580c',
            emphasis: '#c2410c',
            inverted: '#fff',
          },
          background: {
            muted: '#fafaf9',
            subtle: '#f5f5f4',
            DEFAULT: '#fff',
            emphasis: '#292524',
          },
          border: { DEFAULT: '#e7e5e4' },
          ring: { DEFAULT: '#e7e5e4' },
          content: {
            subtle: '#a8a29e',
            DEFAULT: '#78716c',
            emphasis: '#44403c',
            strong: '#1c1917',
            inverted: '#fff',
          },
        },
      },
      boxShadow: {
        'tremor-input': '0 1px 2px rgb(0 0 0 / 0.03)',
        'tremor-card': '0 1px 2px rgb(0 0 0 / 0.02)',
        'tremor-dropdown': '0 8px 20px rgb(0 0 0 / 0.06)',
      },
      borderRadius: {
        'tremor-small': '6px',
        'tremor-default': '10px',
        'tremor-full': '9999px',
      },
      fontSize: {
        'tremor-label': ['0.75rem', { lineHeight: '1rem' }],
        'tremor-default': ['0.875rem', { lineHeight: '1.25rem' }],
        'tremor-title': ['1.125rem', { lineHeight: '1.75rem' }],
        'tremor-metric': ['1.875rem', { lineHeight: '2.25rem' }],
      },
    },
  },
  safelist: [
    // Tremor builds selected-tab color classes dynamically.
    {
      pattern: /^(text|border)-orange-(500|600)$/,
      variants: ['data-[selected]'],
    },
    {
      pattern:
        /^(bg|text|border|ring|stroke|fill)-(orange|rose|sky|emerald|stone|slate|amber|violet)-(50|100|200|300|400|500|600|700|800|900|950)$/,
      variants: ['hover'],
    },
  ],
} satisfies Config
