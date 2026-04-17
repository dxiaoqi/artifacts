import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Map to CSS variables for theme-aware Tailwind classes
        'bg-primary':   'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary':  'var(--bg-tertiary)',
        'bg-input':     'var(--bg-input)',
        'text-primary':   'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary':  'var(--text-tertiary)',
        'text-disabled':  'var(--text-disabled)',
        'accent':         'var(--accent)',
        'accent-hover':   'var(--accent-hover)',
        'accent-bg':      'var(--accent-bg)',
        'border-default': 'var(--border-default)',
        'border-hover':   'var(--border-hover)',
        'border-strong':  'var(--border-strong)',
      },
      fontFamily: {
        sans:  ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        mono:  ['var(--font-mono)'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      transitionDuration: {
        instant:  'var(--duration-instant)',
        fast:     'var(--duration-fast)',
        base:     'var(--duration-base)',
        moderate: 'var(--duration-moderate)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

export default config
