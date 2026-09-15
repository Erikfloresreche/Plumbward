import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  // Shebang: lets npx run the binary directly, with no wrapper.
  banner: { js: '#!/usr/bin/env node' },
})
