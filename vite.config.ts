import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

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
})
