/**
 * Control of the `paths:` filter of the mutation workflow.
 *
 * `mutations.yml` does not run on every PR: only on the ones that touch the
 * files `check-mutations.mjs` mutates or runs. That filter is a list written by
 * hand, and the list of mutations grows: as soon as a new mutation touches a
 * file the filter does not name, the job stops running on the PRs that change
 * it and nobody finds out, because a workflow that does not trigger does not
 * show up red — it does not show up at all.
 *
 * It is the same class of failure as the `if: matrix.node == '22'` of the
 * napkin: a condition that drifts in silence. Here the list is derived from the
 * script itself instead of trusting someone to update both.
 *
 * It lives outside `check-coherence.mjs` for the same reason as
 * `branch-names.mjs`: that script runs on load and ends in `process.exit`, so
 * it cannot be tested. Here there are only pure functions.
 *
 * Task F0-27.
 */

/**
 * Is this literal a file path and not just any value?
 *
 * The constant name does not help to tell: any identifier is recognised,
 * because limiting it to plain uppercase left out the `CX2` written by whoever
 * adds the second mutation on a file already used —the two-letter
 * abbreviations are exhausted— and the file vanished from the list without
 * anything failing.
 *
 * It does not filter by known extension either: that would reopen the same hole
 * as soon as a `.yml` or a `.json` is mutated. It is enough that it looks like a
 * path —a slash, or any extension—, which is what separates `packages/a/b.ts`
 * from `pnpm`. A false positive here fails out loud; a false negative never
 * fails, and that is why the cut is placed on this side.
 *
 * @param {string} value literal of the constant
 * @returns {boolean}
 */
const looksLikePath = (value) => value.includes('/') || /\.[A-Za-z0-9]+$/.test(value)

/**
 * Files `check-mutations.mjs` mutates or runs as a test.
 *
 * Three sources, because the script uses all three: the file constants
 * (`const BR = '...'`), the `TESTS` array, and any path written as a literal in
 * the file position of a mutation.
 *
 * @param {string} scriptText content of `scripts/check-mutations.mjs`
 * @returns {string[]} paths relative to the root, sorted and without repeats
 */
export function mutationInputs(scriptText) {
  const files = new Set()

  for (const m of scriptText.matchAll(/^const [A-Za-z_$][\w$]* = '([^']+)'$/gm)) {
    if (looksLikePath(m[1])) files.add(m[1])
  }

  const tests = /const TESTS = \[([\s\S]*?)\]/.exec(scriptText)
  if (tests) for (const m of tests[1].matchAll(/'([^']+)'/g)) files.add(m[1])

  // File position of a mutation written as a literal instead of a constant:
  // `['description', 'path/to/file.ts', ...]`.
  for (const m of scriptText.matchAll(/^\s*\['(?:[^'\\]|\\.)*',\s*'([^']+)'/gm)) files.add(m[1])

  return [...files].sort()
}

/**
 * Paths declared in the `paths:` filter of a workflow.
 *
 * @param {string} workflowText content of the workflow file
 * @returns {string[]} paths as written, without quotes
 */
export function workflowPaths(workflowText) {
  const lines = workflowText.split('\n')
  const indentOf = (line) => /^(\s*)/.exec(line)[1].length

  // The filter that matters is the `pull_request` one, not the first `paths:` of
  // the file: a `push:` trigger with its own list ahead of it hijacked the
  // control, which validated that list and never looked at the one filtering PRs.
  const pr = lines.findIndex((line) => /^\s+pull_request:\s*$/.test(line))
  if (pr === -1) return []

  let start = -1
  for (let i = pr + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue
    if (indentOf(lines[i]) <= indentOf(lines[pr])) break
    if (/^\s+paths:\s*$/.test(lines[i])) {
      start = i
      break
    }
  }
  if (start === -1) return []

  const indent = indentOf(lines[start])
  const paths = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue

    // A line that is not indented further than `paths:` is already another key.
    if (indentOf(line) <= indent) break

    // Comments do not interrupt the list: the filter has one in the middle to
    // separate the mutated files from the ones that govern the run.
    const content = line.trim()
    if (content.startsWith('#')) continue

    const entry = /^-\s*'?([^']+?)'?\s*$/.exec(content)
    if (!entry) break
    paths.push(entry[1])
  }
  return paths
}

/**
 * Files the script mutates or runs that the workflow filter does not name.
 *
 * The exact path is required, not a pattern that covers it: a `packages/**`
 * would make the control pass and send the job back to running on PRs that do
 * not need it, which is exactly what the filter avoids.
 *
 * @param {string} scriptText content of `scripts/check-mutations.mjs`
 * @param {string} workflowText content of `.github/workflows/mutations.yml`
 * @returns {string[]} uncovered paths, sorted
 */
export function uncoveredMutationInputs(scriptText, workflowText) {
  const declared = new Set(workflowPaths(workflowText))
  return mutationInputs(scriptText).filter((file) => !declared.has(file))
}
