import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'fg-deepest': 'var(--fg-bg-deepest)',
        'fg-surface': 'var(--fg-bg-surface)',
        'fg-elevated': 'var(--fg-bg-elevated)',
        'fg-border': 'var(--fg-border)',
        'fg-red': 'var(--fg-accent-red)',
        'fg-amber': 'var(--fg-accent-amber)',
        'fg-green': 'var(--fg-accent-green)',
        'fg-blue': 'var(--fg-accent-blue)',
      },
      fontFamily: {
        display: ['JetBrains Mono', 'Fira Code', 'monospace'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
} satisfies Config
