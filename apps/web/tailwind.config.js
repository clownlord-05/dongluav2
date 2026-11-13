/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FF4500',
          dark: '#CC3700',
        },
        accent: '#FFD700',
        bg: {
          base: '#0D0D0D',
          card: '#1A1A1A',
          panel: '#141414',
        },
        text: {
          primary: '#F0F0F0',
          secondary: '#A0A0A0',
        },
        success: '#22C55E',
        danger: '#EF4444',
        warning: '#EAB308',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-fire': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'wave': 'wave 1s ease-in-out infinite',
      },
      keyframes: {
        wave: {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
    },
  },
  plugins: [],
};
