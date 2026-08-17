import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.VITE_DEV_BACKEND_URL || 'http://localhost:5000',
      '/socket.io': { target: process.env.VITE_DEV_BACKEND_URL || 'http://localhost:5000', ws: true },
    },
  },
})
