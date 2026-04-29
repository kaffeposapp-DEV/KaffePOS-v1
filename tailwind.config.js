/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#FF6A00',
          secondary: '#FF8A1C',
          bg: '#FFF6EF',
          white: '#FFFFFF',
          dark: '#1F2933',
          muted: '#6B7280',
          border: '#E5E7EB',
          success: '#16A34A',
          warning: '#F59E0B',
          danger: '#EF4444',
        },
        // Legacy KaffePOS brand - Mapped to new primary
        kaffe: {
          50:  'var(--theme-50, #FFF6EF)',
          100: 'var(--theme-100, #FFF0E6)',
          200: 'var(--theme-200, #FFE0C2)',
          300: 'var(--theme-300, #FDBA74)',
          400: 'var(--theme-400, #FB923C)',
          500: 'var(--theme-500, #FF6A00)',
          600: 'var(--theme-600, #EA580C)',
          700: 'var(--theme-700, #C2410C)',
          800: 'var(--theme-800, #9A3412)',
          900: 'var(--theme-900, #7C2D12)',
        },
        orange: {
          50:  'var(--theme-50, #FFF6EF)',
          100: 'var(--theme-100, #FFF0E6)',
          200: 'var(--theme-200, #FFE0C2)',
          300: 'var(--theme-300, #FDBA74)',
          400: 'var(--theme-400, #FB923C)',
          500: 'var(--theme-500, #FF6A00)',
          600: 'var(--theme-600, #EA580C)',
          700: 'var(--theme-700, #C2410C)',
          800: 'var(--theme-800, #9A3412)',
          900: 'var(--theme-900, #7C2D12)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['Outfit', 'Inter', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        'safe-top':    'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'safe-left':   'env(safe-area-inset-left, 0px)',
        'safe-right':  'env(safe-area-inset-right, 0px)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'premium': '0 10px 40px -10px rgba(255, 106, 0, 0.15)',
        'premium-hover': '0 20px 50px -15px rgba(255, 106, 0, 0.25)',
        'soft': '0 4px 20px -1px rgba(0, 0, 0, 0.04), 0 2px 10px -1px rgba(0, 0, 0, 0.02)',
      },
      animation: {
        'in': 'fadeIn 0.2s ease',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'shake': 'shake 0.4s ease',
        'spin-slow': 'spin 2s linear infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'scale(0.98)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '20%':     { transform: 'translateX(-8px)' },
          '40%':     { transform: 'translateX(8px)' },
          '60%':     { transform: 'translateX(-5px)' },
          '80%':     { transform: 'translateX(5px)' },
        },
      },
    },
  },
  plugins: [],
};
