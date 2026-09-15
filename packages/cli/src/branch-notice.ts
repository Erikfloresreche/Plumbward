/**
 * Branch notice after an operation that can leave HEAD somewhere else.
 *
 * `apply` isolates the work on a new branch, and neither the automatic revert
 * of a failed `apply` nor `rollback` undoes it: they revert files, not
 * branches. Saying only "the repository is intact" is half false, and whoever
 * reads it will keep working on the isolated branch believing they are on
 * their own.
 *
 * It is split from `commands.ts` so the text can be tested without causing a
 * real EACCES (same reason as item 4 of F0-15: inline logic nobody covers).
 */

export interface BranchNoticeInput {
  /** Branch the repository was left on. `null` with a detached HEAD. */
  readonly currentBranch: string | null
  /** Branch `apply` was launched from. `null` if it was already detached. */
  readonly startedOnBranch: string | null
  /**
   * Commit the work started on, to name it when there is no branch to name.
   * `null` only in a repository with no commits at all.
   *
   * It comes from the journal (`writtenOnCommit`): without it, the advice was
   * `git checkout <commit>` and left the user to fill a gap they can no longer
   * fill, because HEAD has been elsewhere since `apply` isolated.
   */
  readonly startedOnCommit: string | null
  /** Name of the isolated branch, to recognise it and warn that it is left over. */
  readonly isolatedBranch: string
  /**
   * `true` when a `rollback` is still pending: `apply` failed and the automatic
   * revert **also** failed, so the tree has half-written files and the journal
   * is still alive.
   *
   * It changes the whole advice, not a detail. With half-done work, `git
   * checkout` drags those files to the other branch, and deleting the isolated
   * branch makes the `rollback` impossible forever: `assertSameBranch` requires
   * being on it and it no longer exists.
   */
  readonly pendingRollback: boolean
}

/**
 * How to go back when the work started without a branch. With the recorded
 * commit it is named; without it —a repository with no commits at all— there
 * is nothing to go back to with `checkout`.
 */
function returnToCommit(startedOnCommit: string | null): string {
  return startedOnCommit === null
    ? '`git checkout --detach` from wherever you like: the repository had no commit at all when it started'
    : `\`git checkout ${startedOnCommit}\``
}

/**
 * Lines to print, uncoloured and unindented. Empty when there is nothing to
 * say: the repository was left where it was.
 */
export function branchReturnNotice(input: BranchNoticeInput): readonly string[] {
  const { currentBranch, startedOnBranch, startedOnCommit, isolatedBranch, pendingRollback } = input

  if (currentBranch === startedOnBranch) return []

  const lines = [
    currentBranch === null
      ? 'HEAD was left detached, not on the branch you started on.'
      : `You are still on branch "${currentBranch}", not on the one you started on.`,
  ]

  if (pendingRollback) {
    lines.push(
      'Do not go back yet: there are half-written files, and a `git checkout` would carry them with you.',
      startedOnBranch === null
        ? `Run \`plumbward rollback\` here; when it finishes, go back with ${returnToCommit(startedOnCommit)}.`
        : `Run \`plumbward rollback\` here; when it finishes, go back with \`git checkout ${startedOnBranch}\`.`,
    )
    if (currentBranch === isolatedBranch) {
      lines.push(
        `Do not delete "${isolatedBranch}" until then: \`rollback\` only reverts from the branch ` +
          'it wrote on. Since `apply` does not commit, git deletes it without warning that it was still needed.',
      )
    }
    return lines
  }

  lines.push(
    startedOnBranch === null
      ? `You started with a detached HEAD, so there is no branch to name: go back with ${returnToCommit(startedOnCommit)}.`
      : `Go back to yours with \`git checkout ${startedOnBranch}\`.`,
  )

  if (currentBranch === isolatedBranch) {
    lines.push(
      `Branch "${isolatedBranch}" is left created and with no changes: delete it with ` +
        `\`git branch -d ${isolatedBranch}\`, or the next \`apply\` will refuse to use it.`,
    )
  }

  return lines
}
