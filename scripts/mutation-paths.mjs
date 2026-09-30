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

  for (const file of testsArray(scriptText)) files.add(file)

  // File position of a mutation written as a literal instead of a constant:
  // `['description', 'path/to/file.ts', ...]`.
  for (const m of scriptText.matchAll(/^\s*\['(?:[^'\\]|\\.)*',\s*'([^']+)'/gm)) files.add(m[1])

  return [...files].sort()
}

/**
 * String literals of the `TESTS` array, read with a scanner instead of a regex.
 *
 * A lazy `[\s\S]*?\]` took a commented-out path as a file —a false red: it
 * demanded in the filter something that no longer runs— and stopped at a `]`
 * inside a comment, silently losing the paths after it —a false green—. The
 * scanner skips comments and ends only at the `]` that closes the array.
 *
 * @param {string} scriptText content of `scripts/check-mutations.mjs`
 * @returns {string[]} the literals, in order; empty if there is no `TESTS`
 */
function testsArray(scriptText) {
  const head = /const TESTS = \[/.exec(scriptText)
  if (!head) return []

  const found = []
  let i = head.index + head[0].length
  while (i < scriptText.length) {
    const c = scriptText[i]
    if (c === ']') return found
    if (scriptText.startsWith('//', i)) {
      const eol = scriptText.indexOf('\n', i)
      i = eol === -1 ? scriptText.length : eol + 1
    } else if (scriptText.startsWith('/*', i)) {
      const close = scriptText.indexOf('*/', i + 2)
      i = close === -1 ? scriptText.length : close + 2
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      let value = ''
      while (j < scriptText.length && scriptText[j] !== c) {
        if (scriptText[j] === '\\') j++
        value += scriptText[j]
        j++
      }
      found.push(value)
      i = j + 1
    } else {
      i++
    }
  }
  throw new Error('the TESTS array of check-mutations.mjs is never closed with "]"')
}

/**
 * One entry of a block sequence: `- 'a.ts'`, `- "a.ts"` or `- a.ts`, with an
 * optional comment at the end. The quotes are not part of the path, and a
 * comment after the entry is not the end of the list.
 */
const ENTRY = /^-\s+(?:'([^']*)'|"([^"]*)"|([^\s'"#][^#]*?))\s*(?:#.*)?$/

/**
 * Paths declared in the `paths:` filter of the `pull_request` trigger.
 *
 * Three answers, because they mean three different things:
 *
 * - `null`: the trigger has no filter, so the workflow runs on every PR. It is
 *   the emergency exit `mutations.yml` documents for the day the job becomes
 *   required, and it is strictly safer than any list: it covers everything.
 * - a list: the filter, as written, without quotes.
 * - an exception: the control cannot tell. No `pull_request` trigger, a
 *   `paths-ignore`, a flow sequence or an entry it cannot read. Guessing there
 *   would be a green that means nothing, or a red that blames the wrong file.
 *
 * @param {string} workflowText content of the workflow file
 * @returns {string[] | null} declared paths, or `null` if there is no filter
 * @throws {Error} if the filter cannot be read, with the reason
 */
export function workflowPaths(workflowText) {
  const lines = workflowText.split('\n')
  const indentOf = (line) => /^(\s*)/.exec(line)[1].length
  const skip = (line) => line.trim() === '' || line.trim().startsWith('#')

  // The filter that matters is the `pull_request` one, not the first `paths:` of
  // the file: a `push:` trigger with its own list ahead of it hijacked the
  // control, which validated that list and never looked at the one filtering PRs.
  const pr = lines.findIndex((line) => /^\s+pull_request:\s*$/.test(line))
  if (pr === -1) throw new Error('no `pull_request:` trigger written as a block: the workflow may not run on PRs at all')

  let start = -1
  for (let i = pr + 1; i < lines.length; i++) {
    if (skip(lines[i])) continue
    if (indentOf(lines[i]) <= indentOf(lines[pr])) break
    if (/^\s+paths-ignore:/.test(lines[i])) {
      throw new Error('`paths-ignore:` is not supported: the control cannot tell which files it leaves out')
    }
    const key = /^\s+paths:(.*)$/.exec(lines[i])
    if (key) {
      if (key[1].replace(/#.*$/, '').trim() !== '') {
        throw new Error(`\`paths:\` written inline is not supported, only as a block list: "${lines[i].trim()}"`)
      }
      start = i
      break
    }
  }
  if (start === -1) return null

  const indent = indentOf(lines[start])
  const paths = []
  for (const line of lines.slice(start + 1)) {
    // Comments do not interrupt the list: the filter has one in the middle to
    // separate the mutated files from the ones that govern the run.
    if (skip(line)) continue

    // A line less indented than `paths:` is already another key. At the same
    // indentation only a `-` continues the list: YAML allows the sequence
    // not to be indented under its key.
    const content = line.trim()
    if (indentOf(line) < indent) break
    if (indentOf(line) === indent && !content.startsWith('-')) break

    const entry = ENTRY.exec(content)
    // A `key: value` after the dash is a mapping, not a path.
    if (!entry || /:(\s|$)/.test(entry[3] ?? '')) throw new Error(`the control cannot read this entry of the \`paths:\` filter: "${content}"`)
    paths.push(entry[1] ?? entry[2] ?? entry[3])
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
 * @throws {Error} if the filter cannot be read (see `workflowPaths`)
 */
export function uncoveredMutationInputs(scriptText, workflowText) {
  const paths = workflowPaths(workflowText)
  // No filter: the workflow runs on every PR, so nothing is left out.
  if (paths === null) return []
  const declared = new Set(paths)
  return mutationInputs(scriptText).filter((file) => !declared.has(file))
}
