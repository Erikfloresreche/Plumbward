/**
 * Verdict of one run of the test suite against a mutation.
 *
 * It exists because `result.status !== 0` said "the mutation is caught" also
 * when the tests never ran: `spawnSync` returns `status: null` if it cannot
 * launch the process —a `pnpm` that is not on the PATH, a half-done `install`,
 * a runner out of memory— or if the `timeout` fires, and `null !== 0` is true.
 * The result was "30 of 30 mutations detected" and a green CI with zero tests
 * run: exactly the opposite of what this control promises.
 *
 * It lives outside `check-mutations.mjs` so it can be tested: that script runs
 * on load and ends in `process.exit`. Task F0-27.
 */

/**
 * @typedef {'detected' | 'survived' | 'not-run'} Outcome
 */

/**
 * Classifies the result of `spawnSync`.
 *
 * - `detected`: the tests ran and one failed. The piece is covered.
 * - `survived`: the tests ran and all passed. The piece is not covered.
 * - `not-run`: nothing is known. It is not a detection, and cannot count as
 *   one: it counts as a failure so the CI turns red.
 *
 * @param {{ status: number | null, error?: Error }} result result of `spawnSync`
 * @returns {Outcome}
 */
export function mutationOutcome(result) {
  if (result.error || result.status === null) return 'not-run'
  return result.status === 0 ? 'survived' : 'detected'
}

/** A verdict other than `detected` turns the CI red. */
export const isFailure = (outcome) => outcome !== 'detected'

/** Twelve-character label to align the script output. */
export const label = (outcome) =>
  ({ detected: 'DETECTED    ', survived: 'SURVIVED    ', 'not-run': 'NOT RUN     ' })[outcome]
