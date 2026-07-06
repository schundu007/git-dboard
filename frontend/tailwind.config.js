/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // CSS-variable surfaces — adapt to light/dark theme
        surface: {
          DEFAULT: 'rgb(var(--sfc)  / <alpha-value>)',
          1:       'rgb(var(--sfc1) / <alpha-value>)',
          2:       'rgb(var(--sfc2) / <alpha-value>)',
          3:       'rgb(var(--sfc3) / <alpha-value>)',
          4:       'rgb(var(--sfc4) / <alpha-value>)',
          5:       'rgb(var(--sfc5) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--bdr)   / <alpha-value>)',
          subtle:  'rgb(var(--bdr-s) / <alpha-value>)',
          strong:  'rgb(var(--bdr-x) / <alpha-value>)',
        },

        // ── Brand ──────────────────────────────────────────────────────────
        brand:        '#76b900',   // primary brand accent
        'brand-dark': '#4a7400',   // brand accent dark variant

        // ── Accent system ────────────────────────────────────────────────
        accent: {
          green:  '#76b900',   // brand — success, active, live, confirmed
          blue:   '#0a66c2',   // info, links, secondary actions
          red:    '#b24020',   // error, danger, critical
          yellow: '#d97706',   // amber-600 — warning / queued states
          orange: '#b24020',
          purple: '#0a66c2',
          cyan:   '#76b900',
          teal:   '#76b900',
          indigo: '#0a66c2',
          lime:   '#76b900',   // aliased to brand green — neon lime retired
        },

        // ── DORA metrics ──────────────────────────────────────────────────────
        dora: {
          deploy: '#0a66c2',   // LinkedIn blue
          lead:   '#76b900',   // brand green
          mttr:   '#d0d0d0',   // near-white (neutral series)
          cfr:    '#b24020',   // LinkedIn negative red
        },

        // ── Gray scale — white-forward, elevated readability ───────────────
        // Standard Tailwind gray is too blue-tinted and dim on dark backgrounds.
        // This neutral gray scale is pure, progressively brighter.
        gray: {
          50:  '#fafafa',
          100: '#f5f5f5',
          200: '#e8e8e8',
          300: '#d4d4d4',
          400: '#b0b0b0',   // was ~#9ca3af — clearly readable secondary text
          500: '#909090',   // was ~#6b7280 — main secondary text, now visible
          600: '#6e6e6e',   // was ~#4b5563 — muted but legible
          700: '#484848',
          800: '#2c2c2c',
          900: '#1a1a1a',
          950: '#0d0d0d',
        },

        // ── Neutral scale (same as gray for compat) ────────────────────────
        neutral: {
          50:  '#fafafa',
          100: '#f5f5f5',
          200: '#e8e8e8',
          300: '#d4d4d4',
          400: '#b0b0b0',
          500: '#909090',
          600: '#6e6e6e',
          700: '#484848',
          800: '#2c2c2c',
          900: '#1a1a1a',
          950: '#0d0d0d',
        },
      },
      fontFamily: {
        display: ['Source Sans 3', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        sans:    ['Source Sans 3', 'system-ui', 'sans-serif'],
        mono:    ['Source Code Pro', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem',  { lineHeight: '1rem' }],
        '3xs': ['0.58rem',  { lineHeight: '0.875rem' }],
      },
      spacing: {
        sidebar:             '220px',
        'sidebar-collapsed': '60px',
        header:              '52px',
      },
      boxShadow: {
        // Elevation — soft white-card shadows
        card:         '0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
        'card-hover': '0 6px 24px rgba(0,0,0,0.11), 0 0 0 1px rgba(0,0,0,0.05)',
        sm:           '0 1px 3px rgba(0,0,0,0.08)',
        md:           '0 4px 12px rgba(0,0,0,0.09)',
        lg:           '0 8px 24px rgba(0,0,0,0.11)',
        xl:           '0 16px 40px rgba(0,0,0,0.14)',
        inner:        'inset 0 2px 4px rgba(0,0,0,0.04)',
        highlight:    'inset 0 1px 0 rgba(255,255,255,0.8)',
        // Accent glows
        'glow-green': '0 0 24px rgba(118,185,0,0.22)',
        'glow-blue':  '0 0 24px rgba(11,92,255,0.22)',
        'glow-red':   '0 0 24px rgba(255,27,45,0.22)',
        'glow-lime':  '0 0 20px rgba(224,255,79,0.25)',
        // Palette modal
        palette: '0 24px 48px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
      },
      borderRadius: {
        xl2: '1rem',
        xl3: '1.25rem',
      },
      keyframes: {
        'fade-in':   { from: { opacity: '0' },                                to: { opacity: '1' } },
        'fade-up':   { from: { opacity: '0', transform: 'translateY(8px)' },  to: { opacity: '1', transform: 'translateY(0)' } },
        'fade-down': { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'scale-in':  { from: { opacity: '0', transform: 'scale(0.96)' },      to: { opacity: '1', transform: 'scale(1)' } },
        'slide-in':  { from: { transform: 'translateX(12px)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
        'shimmer':   { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        'spin-slow': { from: { transform: 'rotate(0deg)' },                   to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        'fade-in':   'fade-in 0.15s ease-out',
        'fade-up':   'fade-up 0.2s ease-out',
        'fade-down': 'fade-down 0.2s ease-out',
        'scale-in':  'scale-in 0.15s ease-out',
        'slide-in':  'slide-in 0.2s ease-out',
        'shimmer':   'shimmer 1.6s linear infinite',
        'spin-slow': 'spin-slow 2s linear infinite',
      },
      transitionTimingFunction: {
        expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
