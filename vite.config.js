import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

const backend = `http://localhost:${process.env.PORT || 3210}`

export default defineConfig({
  plugins: [preact(), tailwindcss()],
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
          langs: [
            '@codemirror/lang-javascript',
            '@codemirror/lang-json',
            '@codemirror/lang-html',
            '@codemirror/lang-css',
            '@codemirror/lang-markdown',
            '@codemirror/lang-python'
          ],
          xterm: ['@xterm/xterm', '@xterm/addon-fit']
        }
      }
    }
  }
})
