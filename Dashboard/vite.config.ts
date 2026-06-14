import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    global: 'globalThis',
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    proxy: {
      '/person1-api': {
        target: 'http://127.0.0.1:8080',
        rewrite: (path) => path.replace(/^\/person1-api/, '') || '/',
        changeOrigin: true,
      },
      '/person3-api': {
        target: 'http://127.0.0.1:8082',
        rewrite: (path) => path.replace(/^\/person3-api/, '') || '/',
        changeOrigin: true,
      },
      '/person2-ml': {
        target: 'http://127.0.0.1:8083',
        rewrite: (path) => path.replace(/^\/person2-ml/, '') || '/',
        changeOrigin: true,
      },
      '/simulator-control': {
        target: 'http://127.0.0.1:8095',
        rewrite: (path) => path.replace(/^\/simulator-control/, '') || '/',
        changeOrigin: true,
      },
    },
  },
})
