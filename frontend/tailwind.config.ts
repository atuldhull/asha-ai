import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Care level palette — green / amber / red
        care: {
          home: {
            DEFAULT: '#16a34a', // green-600
            bg: '#f0fdf4',      // green-50
            border: '#86efac',  // green-300
          },
          clinic: {
            DEFAULT: '#d97706', // amber-600
            bg: '#fffbeb',      // amber-50
            border: '#fcd34d',  // amber-300
          },
          emergency: {
            DEFAULT: '#dc2626', // red-600
            bg: '#fef2f2',      // red-50
            border: '#fca5a5',  // red-300
          },
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
