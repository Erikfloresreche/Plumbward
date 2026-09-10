import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url))

/**
 * Los tests se ejecutan directamente sobre `src` (sin build previo) mediante
 * alias de workspace. Esto mantiene el ciclo de feedback en segundos.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@plumbward/core': r('./packages/core/src/index.ts'),
      '@plumbward/ast': r('./packages/ast/src/index.ts'),
      '@plumbward/scanner': r('./packages/scanner/src/index.ts'),
      '@plumbward/packs-sdk': r('./packages/packs-sdk/src/index.ts'),
      '@plumbward/pack-node-ts': r('./packages/packs/node-ts/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/src/**/*.test.ts', 'packages/**/test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
