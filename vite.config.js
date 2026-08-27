import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The app always calls a relative /api, which works unchanged wherever the
    // backend is served from the same origin. In dev the backend runs on its
    // own port, so proxy across rather than hardcoding a localhost URL into
    // the client bundle.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
