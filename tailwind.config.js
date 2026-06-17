/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,tsx,ts,jsx,js}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          light: '#ffffff',
          dark: '#1e1e2e'
        },
        panel: {
          light: '#f8f9fa',
          dark: '#2a2a3e'
        },
        border: {
          light: '#e5e7eb',
          dark: '#3a3a50'
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#5558e6',
          light: '#eef2ff'
        },
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444'
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.25rem'
      },
      animation: {
        'pulse-glow': 'pulse-glow 1.5s ease-in-out infinite',
        'border-blink': 'border-blink 0.8s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out'
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(99, 102, 241, 0.4)' },
          '50%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.8)' }
        },
        'border-blink': {
          '0%, 100%': { borderColor: 'rgba(99, 102, 241, 0.4)' },
          '50%': { borderColor: 'rgba(99, 102, 241, 1)' }
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      }
    }
  },
  plugins: []
}
