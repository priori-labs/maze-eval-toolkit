import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  cacheDir: resolve(__dirname, '../../node_modules/.vite-ui-mazes'),
  resolve: {
    alias: {
      '@': resolve(__dirname, '..'),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss({ config: resolve(__dirname, 'tailwind.config.js') }), autoprefixer()],
    },
  },
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:3017',
        changeOrigin: true,
      },
    },
  },
})
