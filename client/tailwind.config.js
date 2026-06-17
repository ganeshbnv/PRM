/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#dbe4ff',
          500: '#4c6ef5',
          600: '#3b5bdb',
          700: '#2f4ac2',
          900: '#1a2d8a',
        },
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          card:    'rgb(var(--color-surface-card) / <alpha-value>)',
          elevated:'rgb(var(--color-surface-elevated) / <alpha-value>)',
          border:  'rgb(var(--color-surface-border) / <alpha-value>)',
          raised:  'rgb(var(--color-surface-raised) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      keyframes: {
        'pop-up': {
          '0%':   { transform: 'scale(0.94) translateY(8px)', opacity: '0' },
          '100%': { transform: 'scale(1)    translateY(0)',   opacity: '1' },
        },
      },
      animation: {
        'pop-up': 'pop-up 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
};
