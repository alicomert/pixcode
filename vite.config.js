import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

const backend = `http://localhost:${process.env.PORT || process.env.PIXCODE_PORT || 3001}`

export default defineConfig({
  plugins: [tailwindcss()],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact'
  },
  server: {
    port: 5199,
    proxy: {
      '/api': backend,
      '/ws': { target: backend, ws: true }
    }
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          cm: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
            '@codemirror/language',
            '@codemirror/search',
            '@codemirror/autocomplete',
            '@codemirror/merge'
          ],
          xterm: ['@xterm/xterm', '@xterm/addon-fit']
        }
      }
    }
  }
})
