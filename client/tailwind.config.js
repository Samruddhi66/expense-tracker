/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f6f2ff',
          100: '#ede5ff',
          200: '#dccfff',
          300: '#c3a9ff',
          400: '#a578fb',
          500: '#8b4ef2',
          600: '#7c2fe0',
          700: '#6b21c4',
          800: '#571ba0',
          900: '#451883',
          950: '#2a0b57',
        },
        lavender: '#e9e0ff',
        ink: {
          50: '#f7f6fb',
          100: '#eeeaf6',
          200: '#ddd6ea',
          300: '#c3b8d8',
          400: '#9f90bd',
          500: '#7e6d9e',
          600: '#655584',
          700: '#4f4268',
          800: '#2f2542',
          900: '#1c1430',
          950: '#110a20',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(28, 20, 48, 0.04), 0 12px 32px -12px rgba(76, 29, 149, 0.18)',
        float: '0 24px 60px -24px rgba(76, 29, 149, 0.4)',
        glow: '0 0 0 1px rgba(139, 78, 242, 0.18), 0 18px 50px -18px rgba(139, 78, 242, 0.55)',
      },
      borderRadius: {
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s ease-out both',
      },
    },
  },
  plugins: [],
};
