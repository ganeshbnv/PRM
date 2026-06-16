import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        sidebar: {
          bg:      '#0f172a',
          surface: '#1e293b',
          hover:   '#1e293b',
          active:  '#312e81',
          text:    '#e2e8f0',
          muted:   '#94a3b8',
          accent:  '#818cf8',
          border:  '#1e293b',
        },
        surface: {
          base:   '#ffffff',
          subtle: '#fafafa',
          muted:  '#f1f5f9',
          border: '#e2e8f0',
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.08)',
        float: '0 8px 24px -4px rgba(0,0,0,0.14)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
} satisfies Config;
