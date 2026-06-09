import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { defineConfig } from 'vitest/config'

// The build emits a single self-contained index.html (all JS/CSS inlined) so it can be
// hosted statically at a root path OR downloaded and opened offline — important for a
// break-glass tool that reveals private keys: users can run a verified local copy.
export default defineConfig({
  base: '',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
  // Unit tests for the core lib (decoding, coverage math, mock contract). Node env: the
  // lib is pure data/crypto with no DOM, and a node env keeps IS_MOCK off by default.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
