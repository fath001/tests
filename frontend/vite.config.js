import { existsSync, mkdirSync, cpSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function mathliveFontsPlugin() {
  const root = dirname(fileURLToPath(import.meta.url))
  const source = resolve(root, 'node_modules/mathlive/fonts')
  const target = resolve(root, 'public/mathlive/fonts')

  const copyFonts = () => {
    if (!existsSync(source)) {
      return
    }

    mkdirSync(dirname(target), { recursive: true })
    cpSync(source, target, { recursive: true })
  }

  return {
    name: 'mathlive-font-assets',
    buildStart: copyFonts,
    configureServer: copyFonts,
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [mathliveFontsPlugin(), react()],
  build: {
    chunkSizeWarningLimit: 1000,
  },
})