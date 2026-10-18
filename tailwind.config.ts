import type { Config } from 'tailwindcss';

function token(name: string) {
  return ({ opacityValue }: { opacityValue?: string }) => {
    if (opacityValue === undefined) return `var(--${name})`;
    const alpha = Number(opacityValue);
    const amount = Number.isFinite(alpha)
      ? `${Math.round(alpha * 1000) / 10}%`
      : `calc(${opacityValue} * 100%)`;
    return `color-mix(in srgb, var(--${name}) ${amount}, transparent)`;
  };
}

/**
 * Tailwind wired to the semantic CSS-variable tokens in src/styles/tokens.css
 * (PORTAL_UI_PLAN.md §3). Components reference these names, never raw hex.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        red: token('red'),
        'red-press': token('red-press'),
        'red-tint': token('red-tint'),
        navy: token('navy'),
        'navy-tint': token('navy-tint'),
        slate: token('slate'),
        grey: token('grey'),
        canvas: token('canvas'),
        sunken: token('sunken'),
        surface: token('surface'),
        ink: token('ink'),
        'status-pending': token('status-pending'),
        'status-approved': token('status-approved'),
        'status-rejected': token('status-rejected'),
        'status-inactive': token('status-inactive'),
        'status-live': token('status-live'),
        'status-live-ink': token('status-live-ink'),
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
  corePlugins: {
    backgroundOpacity: false,
    borderOpacity: false,
    divideOpacity: false,
    placeholderOpacity: false,
    ringOpacity: false,
    textOpacity: false,
  },
  plugins: [],
} satisfies Config;
