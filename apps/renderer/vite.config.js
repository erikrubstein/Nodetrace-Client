import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rendererDir = fileURLToPath(new URL('.', import.meta.url))
const apiBaseUrl = process.env.VITE_API_BASE_URL || 'http://127.0.0.1:3001'
const host = process.env.VITE_HOST || '127.0.0.1'
const port = Number(process.env.VITE_PORT || 5173)

// https://vite.dev/config/
export default defineConfig({
  base: './',
  root: rendererDir,
  plugins: [react()],
  build: {
    outDir: path.resolve(rendererDir, '../../dist'),
    emptyOutDir: true,
  },
  server: {
    host,
    port,
    strictPort: true,
    proxy: {
      '/api': apiBaseUrl,
      '/uploads': apiBaseUrl,
    },
  },
})
