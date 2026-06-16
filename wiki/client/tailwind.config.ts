import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        sidebar: {
          bg: '#1B2559',
          hover: '#2d3a6e',
          active: '#3b4f8a',
          text: '#c8d1e8',
          muted: '#8896bb',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
