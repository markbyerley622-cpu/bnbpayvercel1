import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Proxy API requests to avoid CORS issues during development
      // NOTE: Production API has bugs - see SIMPLE_SOLUTION.md for details
      '/api': {
        target: 'https://api.bnbpay.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        secure: false, // Disable SSL verification in dev (Windows cert revocation issue)
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        history: resolve(__dirname, 'history.html'),
        calendar: resolve(__dirname, 'calendar.html'),
      },
    },
  },
  // Handle SPA routing for /invoice/:id and /subscription/:id
  appType: 'spa',
})
