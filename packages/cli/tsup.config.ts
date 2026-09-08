import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  // Shebang: permite ejecutar el binario directamente vía npx sin wrapper.
  banner: { js: '#!/usr/bin/env node' },
})
