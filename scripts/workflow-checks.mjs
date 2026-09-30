/**
 * Controls that walk every workflow in `.github/workflows`.
 *
 * They live outside `check-coherence.mjs` for the same reason as
 * `mutation-paths.mjs`: that script runs on load and ends in `process.exit`,
 * so it cannot be tested. Here there are only functions.
 *
 * Task F0-32.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * @typedef {object} Workflow
 * @property {string} path path relative to the repository root
 * @property {string} text content of the file
 */

/**
 * Every workflow of the repository, sorted by name.
 *
 * A directory that cannot be read throws: it is not the same thing as a
 * repository with no workflows, and it must not pass for one.
 *
 * @param {string} root repository root
 * @returns {Workflow[]}
 */
export function readWorkflows(root) {
  const dir = '.github/workflows'
  return readdirSync(join(root, dir))
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort()
    .map((f) => ({ path: `${dir}/${f}`, text: readFileSync(join(root, dir, f), 'utf8') }))
}

/**
 * Control 1b: no `if: matrix.node == 'X'` points at a version that is not in
 * the matrix of its own workflow.
 *
 * Born from the review of PR #6: after changing the matrix from '22' to
 * '22.13', two steps with `if: matrix.node == '22'` were skipped in silence on
 * every run. It looked only at `ci.yml`; since F0-32 it walks every workflow,
 * so a new workflow with a matrix gets the control too.
 *
 * @param {Workflow[]} workflows
 * @returns {string[]} one reason per condition that would never match
 */
export function matrixConditionProblems(workflows) {
  const problems = []
  for (const { path, text } of workflows) {
    const matrix = /node: \[([^\]]+)\]/.exec(text)
    const versions = matrix ? matrix[1].split(',').map((v) => v.trim().replace(/'/g, '')) : []
    // Only real `if:` lines: a comment quoting the pattern does not count.
    for (const m of text.matchAll(/^\s*(?:-\s+)?if:.*matrix\.node\s*==\s*'([^']+)'/gm)) {
      if (versions.includes(m[1])) continue
      problems.push(
        matrix
          ? `${path} has a condition "matrix.node == '${m[1]}'" but the matrix is [${versions.join(', ')}]. That step would never run.`
          : `${path} has a condition "matrix.node == '${m[1]}'" but no Node matrix. That step would never run.`,
      )
    }
  }
  return problems
}

/**
 * Control 4: the branches of the CI triggers really exist on the remote.
 *
 * Only the listing of the remote branches is allowed to fail softly: without
 * network or remote it cannot be checked, and that is no reason to fail. The
 * workflows are read outside that `try`. Before F0-32 the `readdirSync` was
 * inside it, so an unreadable `.github/workflows` switched the whole control
 * off while printing that the remote could not be listed, which was false.
 *
 * @param {() => Workflow[]} listWorkflows reads the workflows; its errors propagate
 * @param {() => string[]} listRemoteBranches remote branch names; may throw
 * @returns {{ skipped: boolean, problems: string[] }} `skipped` when the remote
 *   could not be listed or has no branches
 */
export function triggerBranchProblems(listWorkflows, listRemoteBranches) {
  const workflows = listWorkflows()

  let remoteBranches
  try {
    remoteBranches = listRemoteBranches()
  } catch {
    return { skipped: true, problems: [] }
  }
  if (remoteBranches.length === 0) return { skipped: true, problems: [] }

  const problems = []
  for (const { path, text } of workflows) {
    for (const m of text.matchAll(/branches: \[([^\]]+)\]/g)) {
      for (const branch of m[1].split(',').map((r) => r.trim())) {
        if (remoteBranches.includes(branch)) continue

        // Git branch names ARE case-sensitive: `Prod` and `prod` are different
        // branches. A case mismatch is the most likely mistake and the hardest
        // to see at a glance, so it is diagnosed separately instead of saying
        // "does not exist" and leaving the reader to compare letter by letter.
        const caseMatch = remoteBranches.find((r) => r.toLowerCase() === branch.toLowerCase())
        problems.push(
          caseMatch
            ? `${path} triggers on "${branch}", but the remote branch is called "${caseMatch}". Branch names are case-sensitive: the trigger would never fire.`
            : `${path} triggers on the branch "${branch}", which does not exist on the remote. That branch would have no CI. Available branches: ${remoteBranches.join(', ')}.`,
        )
      }
    }
  }
  return { skipped: false, problems }
}
