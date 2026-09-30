import type { Journal } from './types.js'
import { JOURNAL_FILE } from './types.js'
import { readFileIfExists, removeFile, resolveInRepo } from './fs.js'
import { revertEntries } from './apply.js'

export interface RollbackResult {
  readonly restoredFiles: number
  readonly operationsReverted: number
  readonly journal: Journal
}

/** Rollback-specific error, to tell it apart from apply failures. */
export class RollbackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RollbackError'
  }
}

/**
 * Journal written by an earlier version, which does not identify the site it
 * was applied on: v1 stored the starting branch instead of the written one,
 * and v2 stored the branch name but not the commit. There is no way to check
 * that we are still on the same site, so nothing is reverted: restoring blindly
 * is exactly the data loss that was fixed.
 */
export class OutdatedJournalError extends RollbackError {
  constructor() {
    super(
      `The journal "${JOURNAL_FILE}" was written by an earlier version that does not record the site (branch and commit) it was applied on.\n` +
        '  Nothing is reverted: restoring it on the wrong branch would overwrite work.\n' +
        `  Undo the changes with git (\`git diff\`, \`git checkout -- .\`) and delete ${JOURNAL_FILE}.`,
    )
    this.name = 'OutdatedJournalError'
  }
}

/** Reads the journal of the last run, if it exists. */
export async function readJournal(repoRoot: string): Promise<Journal | undefined> {
  const raw = await readFileIfExists(resolveInRepo(repoRoot, JOURNAL_FILE))
  if (raw === undefined) return undefined

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('unknown format')
    }
    const version = (parsed as { version?: unknown }).version
    if (version === 1 || version === 2) {
      throw new OutdatedJournalError()
    }
    if (version !== 3) {
      throw new Error('unknown format')
    }
    return parsed as Journal
  } catch (error) {
    if (error instanceof RollbackError) throw error
    const detail = error instanceof Error ? error.message : String(error)
    throw new RollbackError(`The journal "${JOURNAL_FILE}" is corrupt: ${detail}`)
  }
}

/**
 * Checks that the revert happens where the write happened: same branch **and**
 * same commit. When in doubt, it refuses: the cost of refusing is going back to
 * the right site; the cost of getting it wrong, lost work (same direction as
 * ADR 0005).
 *
 * The name alone is not enough. A branch deleted and recreated on another
 * commit carries the same name and has other content, and a commit made on the
 * isolated branch after the `apply` leaves the snapshots stale. In both cases
 * restoring writes over work that was not there when the tree was photographed.
 */
function assertSameSite(journal: Journal, current: RollbackOptions): void {
  assertSameBranch(journal, current.currentBranch)
  assertSameCommit(journal, current.currentCommit)
}

/** How the messages name the site of the journal: its branch, or none. */
function writtenWhere(journal: Journal): string {
  return journal.writtenOnBranch === null
    ? 'with a detached HEAD'
    : `on branch "${journal.writtenOnBranch}"`
}

/**
 * The label of the site: which branch it was written on, or `null` with a
 * detached HEAD.
 *
 * `null` is compared like any other name (F0-29): a journal written with a
 * detached HEAD is reverted with a detached HEAD, and `assertSameCommit` also
 * requires the same commit, which is what identifies the site since F0-30.
 * Always refusing, as F0-24 did, left that journal irreversible without
 * protecting anything the commit does not already protect.
 *
 * From a branch that points to the same commit it also refuses, for symmetry
 * with the opposite case —journal with a branch, HEAD now detached—, which
 * already refused. **That refusal does not protect uncommitted work:** the
 * `git checkout` the message advises carries the changes of the tree along,
 * and the `rollback` afterwards overwrites them. The same happens with branch
 * journals: neither the branch nor the commit says whether the files are still
 * the ones `apply` left. Checking that is F0-38.
 *
 * With no branch and no commit there is nothing left to compare. `apply` does
 * not write that journal —a detached HEAD always points to a commit—, but a
 * hand-edited one can carry it, and there it refuses.
 */
function assertSameBranch(journal: Journal, currentBranch: string | null): void {
  if (journal.writtenOnBranch === null && journal.writtenOnCommit === null) {
    throw new RollbackError(
      'The journal records neither the branch nor the commit it was written on.\n' +
        '  Nothing is reverted: there is no way to check that you are still on the same site.\n' +
        '  Undo the changes with git (`git diff`, `git checkout -- .`).',
    )
  }

  if (currentBranch === journal.writtenOnBranch) return

  const where =
    currentBranch === null ? 'HEAD is detached' : `you are on branch "${currentBranch}"`
  const back =
    journal.writtenOnBranch === null
      ? `git checkout --detach ${journal.writtenOnCommit}`
      : `git checkout ${journal.writtenOnBranch}`
  throw new RollbackError(
    `The last \`apply\` wrote ${writtenWhere(journal)}, but ${where}.\n` +
      '  Nothing is reverted: the saved files belong to that site, and restoring them here\n' +
      '  would overwrite what you have on this one.\n' +
      `  Go back with \`${back}\` and run \`plumbward rollback\` there.`,
  )
}

/**
 * Same label, another commit: the branch was deleted and recreated, or there
 * were commits after the `apply` (on a detached HEAD too). The snapshots are of
 * the tree of that commit.
 *
 * Two `null`s do match: a repository with no commit still has none, and there
 * is no history that could have been rewritten underneath.
 */
function assertSameCommit(journal: Journal, currentCommit: string | null): void {
  if (currentCommit === journal.writtenOnCommit) return

  const where = currentCommit === null ? 'now it has none' : `now it points to ${currentCommit}`
  const cause =
    journal.writtenOnBranch === null
      ? '  HEAD is still detached and it is not the same site: there were commits or a switch of\n' +
        '  commit after the `apply`.'
      : '  The branch has the same name and it is not the same site: it was deleted and recreated,\n' +
        '  or there were commits after the `apply`.'
  throw new RollbackError(
    `The last \`apply\` wrote ${writtenWhere(journal)} on commit ` +
      `${journal.writtenOnCommit ?? '(none)'}, but ${where}.\n` +
      `${cause} Nothing is reverted: the saved files belong to\n` +
      '  that commit, and restoring them here would overwrite whatever came after it.\n' +
      '  Undo the changes with git (`git diff`, `git checkout -- .`).',
  )
}

export interface RollbackOptions {
  /**
   * Current branch of the repository, read by the CLI. `null` with a detached
   * HEAD. The core does not talk to git: the caller tells it where it is.
   */
  readonly currentBranch: string | null
  /**
   * Commit HEAD points to now, from the same read as `currentBranch`. `null` in
   * a repository with no commit.
   */
  readonly currentCommit: string | null
}

/**
 * Reverts the last run, leaving the working tree exactly as it was. Expected
 * check: an empty `git status --porcelain` afterwards.
 *
 * **Only on the site `apply` wrote on:** same branch —or a detached HEAD in
 * both cases— and same commit.
 * The snapshots of the journal are photos of the files of that tree; writing
 * them on another one reverts nothing, it erases whatever that other one had.
 * If it does not match, nothing is touched and the journal is kept, so the
 * revert can be done later from the right site.
 *
 * The journal is removed when reverting, so the same run cannot be reverted
 * twice.
 */
export async function rollbackLastApply(
  repoRoot: string,
  options: RollbackOptions,
): Promise<RollbackResult> {
  const journal = await readJournal(repoRoot)
  if (!journal) {
    throw new RollbackError(
      'There is nothing to revert: no journal of a previous run was found.',
    )
  }

  assertSameSite(journal, options)

  const restoredFiles = await revertEntries(journal.entries, repoRoot)
  await removeFile(resolveInRepo(repoRoot, JOURNAL_FILE))

  return {
    restoredFiles,
    operationsReverted: journal.entries.length,
    journal,
  }
}
