import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url))

/**
 * Tests run directly on `src` (no prior build) through workspace aliases. This
 * keeps the feedback loop in seconds.
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
    // Isolates git from the machine configuration and the environment in every
    // test: with a global `commit.gpgsign` or `core.hooksPath`, or an inherited
    // `GIT_DIR`, the tests that create repositories failed or wrote outside.
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'packages/**/src/**/*.test.ts',
      'packages/**/test/**/*.test.ts',
      // The `scripts/` controls are tested too: `check-coherence` ran everything
      // on load and could not be covered (F0-15).
      'scripts/**/*.test.mjs',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
