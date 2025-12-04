/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // BNB Chain branding (exact from checkout-demo)
        'bnb-yellow': '#F0B90B',
        'bnb-dark': '#0B0E11',
        'bnb-gray': '#1E2329',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 20px 60px rgba(0,0,0,0.3)',
        'soft': '0 4px 20px rgba(0,0,0,0.1)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': {
            boxShadow: '0 0 40px rgba(240, 185, 11, 0.3)',
          },
          '50%': {
            boxShadow: '0 0 60px rgba(240, 185, 11, 0.5)',
          },
        },
      },
    },
  },
  plugins: [],
}
