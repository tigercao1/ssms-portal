import type { Config } from 'tailwindcss';

/**
 * Tailwind wired to the semantic CSS-variable tokens in src/styles/tokens.css
 * (PORTAL_UI_PLAN.md §3). Components reference these names, never raw hex.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        red: 'var(--red)',
        'red-press': 'var(--red-press)',
        'red-tint': 'var(--red-tint)',
        navy: 'var(--navy)',
        'navy-tint': 'var(--navy-tint)',
        slate: 'var(--slate)',
        grey: 'var(--grey)',
        canvas: 'var(--canvas)',
        sunken: 'var(--sunken)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        'status-pending': 'var(--status-pending)',
        'status-approved': 'var(--status-approved)',
        'status-rejected': 'var(--status-rejected)',
        'status-inactive': 'var(--status-inactive)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        cjk: 'var(--font-cjk)',
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      transitionTimingFunction: { brand: 'var(--ease)' },
    },
  },
  plugins: [],
} satisfies Config;
