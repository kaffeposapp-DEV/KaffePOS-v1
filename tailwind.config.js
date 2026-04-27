/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // KaffePOS brand
        kaffe: {
          50:  'var(--theme-50, #fdf8f4)',
          100: 'var(--theme-100, #faefe6)',
          200: 'var(--theme-200, #f3d6bd)',
          300: 'var(--theme-300, #ecbd94)',
          400: 'var(--theme-400, #e5a46b)',
          500: 'var(--theme-500, #d8823b)',  // PRIMARY
          600: 'var(--theme-600, #c86f2b)',
          700: 'var(--theme-700, #a35720)',
          800: 'var(--theme-800, #7a421a)',
          900: 'var(--theme-900, #522e15)',
        },
        orange: {
          50:  'var(--theme-50, #fdf8f4)',
          100: 'var(--theme-100, #faefe6)',
          200: 'var(--theme-200, #f3d6bd)',
          300: 'var(--theme-300, #ecbd94)',
          400: 'var(--theme-400, #e5a46b)',
          500: 'var(--theme-500, #d8823b)',  // PRIMARY
          600: 'var(--theme-600, #c86f2b)',
          700: 'var(--theme-700, #a35720)',
          800: 'var(--theme-800, #7a421a)',
          900: 'var(--theme-900, #522e15)',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      animation: {
        'in': 'fadeIn 0.2s ease',
        'slide-up': 'slideUp 0.25s ease',
        'shake': 'shake 0.4s ease',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '20%':     { transform: 'translateX(-8px)' },
          '40%':     { transform: 'translateX(8px)' },
          '60%':     { transform: 'translateX(-5px)' },
          '80%':     { transform: 'translateX(5px)' },
        },
      },
      // Safe area spacing for Android/iOS notch
      spacing: {
        'safe-top':    'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'safe-left':   'env(safe-area-inset-left, 0px)',
        'safe-right':  'env(safe-area-inset-right, 0px)',
      },
    },
  },
  plugins: [],
};
