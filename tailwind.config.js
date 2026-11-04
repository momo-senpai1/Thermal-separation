import headlessui from '@headlessui/tailwindcss';
import animate from 'tailwindcss-animate';

const TREMOR = {
  brand: {
    faint: '#0d2a27',
    muted: '#134e48',
    subtle: '#14b8a6',
    DEFAULT: '#2dd4bf',
    emphasis: '#5eead4',
    inverted: '#06090d',
  },
  background: { muted: '#0a0f15', subtle: '#121a24', DEFAULT: '#0e141c', emphasis: '#b6c2d1' },
  border: { DEFAULT: 'rgba(148,163,184,0.10)' },
  ring: { DEFAULT: 'rgba(148,163,184,0.10)' },
  content: { subtle: '#5c7089', DEFAULT: '#8798ad', emphasis: '#dbe3ec', strong: '#f1f5f9', inverted: '#06090d' },
};

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}', './node_modules/@tremor/**/*.{js,ts,jsx,tsx}'],
  // Tremor builds colour classes at runtime — keep the ones its components use
  safelist: [
    { pattern: /^(bg|text|border|ring|fill|stroke)-(teal|emerald|amber|slate)-(50|100|200|300|400|500|600|700|800|900|950)$/, variants: ['dark'] },
    { pattern: /^bg-(teal|emerald|amber|slate)-(400|500)\/(10|20|30)$/ },
    { pattern: /^ring-(teal|emerald|amber|slate)-(400|500)\/(10|20|30)$/ },
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        // Control-room signal palette
        plant: {
          950: '#06090d',
          900: '#0a0f15',
          850: '#0e141c',
          800: '#121a24',
          700: '#1b2633',
          600: '#273546',
          500: '#3a4b60',
          400: '#5c7089',
          300: '#8798ad',
          200: '#b6c2d1',
          100: '#dbe3ec',
        },
        // Tremor tokens (dark-only app: both scopes map to the control-room palette)
        tremor: TREMOR,
        'dark-tremor': TREMOR,
        signal: {
          liquid: '#2dd4bf', // teal  — liquid / subcooled
          vapor: '#fbbf24', // amber — vapour / superheated
          heat: '#f97316', // orange — heat duty
          alarm: '#f43f5e',
          ok: '#4ade80',
        },
      },
      borderRadius: {
        'tremor-small': '0.25rem',
        'tremor-default': '0.375rem',
        'tremor-full': '9999px',
        lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)',
      },
      fontSize: {
        'tremor-label': ['0.6875rem', { lineHeight: '1rem' }],
        'tremor-default': ['0.75rem', { lineHeight: '1.125rem' }],
        'tremor-title': ['0.875rem', { lineHeight: '1.25rem' }],
        'tremor-metric': ['1.375rem', { lineHeight: '1.75rem' }],
      },
      boxShadow: {
        'tremor-input': '0 1px 2px 0 rgb(0 0 0 / 0.3)',
        'tremor-card': '0 0 0 1px rgba(148,163,184,0.06)',
        'tremor-dropdown': '0 8px 24px -6px rgb(0 0 0 / 0.6)',
        'dark-tremor-input': '0 1px 2px 0 rgb(0 0 0 / 0.3)',
        'dark-tremor-card': '0 0 0 1px rgba(148,163,184,0.06)',
        'dark-tremor-dropdown': '0 8px 24px -6px rgb(0 0 0 / 0.6)',
        glass: '0 0 0 1px rgba(148,163,184,0.08), 0 12px 40px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
        glow: '0 0 0 1px rgba(45,212,191,0.5), 0 0 24px -4px rgba(45,212,191,0.45)',
      },
      keyframes: {
        flow: { to: { strokeDashoffset: '-24' } },
      },
      animation: { flow: 'flow 1.2s linear infinite' },
    },
  },
  plugins: [animate, headlessui],
};
