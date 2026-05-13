/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#080c15',
          1: '#0d1117',
          2: '#161b27',
          3: '#1c2333',
          4: '#21293d',
          5: '#263047',
        },
        border: {
          DEFAULT: '#1e2d45',
          subtle: '#162035',
          strong: '#2a3f60',
        },
        accent: {
          green:  '#22c55e',
          yellow: '#eab308',
          red:    '#ef4444',
          blue:   '#3b82f6',
          purple: '#a855f7',
          orange: '#f97316',
          cyan:   '#06b6d4',
          teal:   '#14b8a6',
          indigo: '#6366f1',
        },
        dora: {
          deploy: '#3b82f6',
          lead:   '#14b8a6',
          mttr:   '#a855f7',
          cfr:    '#f97316',
        },
        neutral: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
        '3xs': ['0.58rem', { lineHeight: '0.875rem' }],
      },
      spacing: {
        sidebar: '220px',
        'sidebar-collapsed': '60px',
        header: '52px',
      },
      boxShadow: {
        card:        '0 1px 3px 0 rgba(0,0,0,0.5), 0 1px 2px -1px rgba(0,0,0,0.5)',
        'card-hover':'0 4px 6px -1px rgba(0,0,0,0.6), 0 2px 4px -2px rgba(0,0,0,0.5)',
        sm:          '0 1px 2px 0 rgba(0,0,0,0.5)',
        md:          '0 4px 6px -1px rgba(0,0,0,0.6)',
        lg:          '0 10px 15px -3px rgba(0,0,0,0.6)',
        xl:          '0 20px 25px -5px rgba(0,0,0,0.7)',
        inner:       'inset 0 2px 4px 0 rgba(0,0,0,0.3)',
        highlight:   'inset 0 1px 0 rgba(255,255,255,0.05)',
        'glow-blue': '0 0 24px rgba(59,130,246,0.18)',
        'glow-green':'0 0 24px rgba(34,197,94,0.15)',
        'glow-red':  '0 0 24px rgba(239,68,68,0.15)',
        'palette':   '0 24px 48px rgba(0,0,0,0.7)',
      },
      borderRadius: {
        xl2: '1rem',
        xl3: '1.25rem',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-down': {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        'slide-left': {
          from: { transform: 'translateX(16px)', opacity: '0' },
          to:   { transform: 'translateX(0)',    opacity: '1' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
        'bounce-dot': {
          '0%,80%,100%': { transform: 'scale(0)' },
          '40%':          { transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in':   'fade-in 0.18s ease-out',
        'fade-up':   'fade-up 0.22s ease-out',
        'fade-down': 'fade-down 0.22s ease-out',
        'scale-in':  'scale-in 0.18s ease-out',
        'slide-left':'slide-left 0.22s ease-out',
        'shimmer':   'shimmer 1.6s linear infinite',
        'spin-slow': 'spin-slow 2s linear infinite',
        'bounce-dot':'bounce-dot 1.4s ease-in-out infinite both',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
    },
  },
  plugins: [],
}
