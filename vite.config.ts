import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the static build works from any path (e.g. GitHub Pages subpath).
  base: './',
  plugins: [react()],
  // BabylonJS is large; ~1.2 MB minified (~300 KB gzip) is expected.
  build: { chunkSizeWarningLimit: 2000 },
})
