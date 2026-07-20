import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const rendererDir = fileURLToPath(new URL('.', import.meta.url))
const clientDir = path.resolve(rendererDir, '../..')
const rootPackageJson = JSON.parse(
  fs.readFileSync(path.join(clientDir, 'package.json'), 'utf8'),
)

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, clientDir, '')
  const env = { ...fileEnv, ...process.env }
  const apiBaseUrl = env.VITE_API_BASE_URL || 'http://127.0.0.1:3001'
  const host = env.VITE_HOST || '127.0.0.1'
  const port = Number(env.VITE_PORT || 5173)

  return {
    base: './',
    root: rendererDir,
    plugins: [react()],
    define: {
      'globalThis.__APP_VERSION__': JSON.stringify(rootPackageJson.version || '0.0.0'),
    },
    build: {
      outDir: path.join(clientDir, 'dist'),
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
  }
})
