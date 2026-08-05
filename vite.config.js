import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Electron loads the production app through file://, so assets must be relative
// to index.html rather than rooted at the filesystem root.
export default defineConfig({
  base: './',
  plugins: [react()],
})
