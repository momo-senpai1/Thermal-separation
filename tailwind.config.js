import animate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
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
        signal: {
          liquid: '#2dd4bf', // teal  — liquid / subcooled
          vapor: '#fbbf24', // amber — vapour / superheated
          heat: '#f97316', // orange — heat duty
          alarm: '#f43f5e',
          ok: '#4ade80',
        },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      boxShadow: {
        glass: '0 0 0 1px rgba(148,163,184,0.08), 0 12px 40px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
        glow: '0 0 0 1px rgba(45,212,191,0.5), 0 0 24px -4px rgba(45,212,191,0.45)',
      },
      keyframes: {
        flow: { to: { strokeDashoffset: '-24' } },
      },
      animation: { flow: 'flow 1.2s linear infinite' },
    },
  },
  plugins: [animate],
};
