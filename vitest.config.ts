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
    // Aísla git de la configuración de la máquina y del entorno en todas las
    // pruebas: con `commit.gpgsign` o un `core.hooksPath` globales, o un
    // `GIT_DIR` heredado, las que crean repositorios fallaban o escribían fuera.
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'packages/**/src/**/*.test.ts',
      'packages/**/test/**/*.test.ts',
      // Los controles de `scripts/` también se prueban: `verificar-coherencia`
      // ejecutaba todo al cargarse y no se podía cubrir (F0-15).
      'scripts/**/*.test.mjs',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
