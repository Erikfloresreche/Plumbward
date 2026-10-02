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
    // Off by default: `pnpm test:coverage` turns it on, in the CI job that
    // runs the whole suite once (F0-7). Unit and e2e runs stay fast.
    coverage: {
      provider: 'v8',
      include: ['packages/**/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      // Each glob is measured as a whole. `core` is held at 90 % because it is
      // the package that writes to the client's repository (R5). The others
      // keep 80 %, or their real figure where it is lower when the gate was
      // set: the gate stops the fall, a later task raises the floor. The text
      // templates have no threshold, so `templates/` is outside every glob.
      thresholds: {
        'packages/core/src/**': { lines: 90, statements: 90, functions: 90, branches: 90 },
        'packages/ast/src/**': { lines: 80, statements: 80, functions: 80, branches: 71 },
        'packages/cli/src/**': { lines: 55, statements: 55, functions: 68, branches: 80 },
        'packages/packs-sdk/src/**': { lines: 75, statements: 75, functions: 80, branches: 73 },
        'packages/scanner/src/**': { lines: 80, statements: 80, functions: 80, branches: 76 },
        'packages/packs/*/src/*.ts': { lines: 80, statements: 80, functions: 80, branches: 80 },
      },
    },
  },
})
