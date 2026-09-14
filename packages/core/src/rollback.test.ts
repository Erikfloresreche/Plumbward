import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rollbackLastApply, OutdatedJournalError, RollbackError } from './rollback.js'
import { JOURNAL_FILE } from './types.js'

/**
 * Point 1 of F0-24, at core level: when `rollbackLastApply` refuses.
 *
 * The end-to-end cases with real git are in
 * `packages/cli/test/rollback-branch.test.ts`. This file pins the decision on
 * its own, without git, including the refusals that cannot be triggered from
 * the CLI without setting up an old or hand-edited journal.
 *
 * Every case also checks that **nothing was written** and that the journal is
 * still there: refusing and leaving the repository half done would be the same
 * failure with another face.
 */

const created: string[] = []

/** Fake repository with a file and a journal that would restore it. */
async function createRepoWithJournal(journal: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plumbward-rollback-core-'))
  created.push(root)
  await writeFile(join(root, 'README.md'), 'current content\n')
  await mkdir(join(root, '.governance'), { recursive: true })
  await writeFile(join(root, JOURNAL_FILE), JSON.stringify(journal, null, 2))
  return root
}

/** Commit the journal of these tests was written on. */
const WRITTEN_COMMIT = '9f1c0d3a8b7e6f5d4c3b2a1908f7e6d5c4b3a219'

/** Journal that, if applied, would take `README.md` back to its previous version. */
function journalWritingReadme(writtenOnBranch: string | null, version = 3): unknown {
  return {
    version,
    startedAt: '2026-09-12T00:00:00.000Z',
    repoRoot: '/irrelevant',
    writtenOnBranch,
    writtenOnCommit: WRITTEN_COMMIT,
    startedOnBranch: writtenOnBranch,
    entries: [
      {
        index: 0,
        operation: {
          kind: 'createFile',
          path: 'README.md',
          content: 'what apply wrote\n',
          managed: true,
          reason: 'test',
        },
        snapshots: [
          {
            path: 'README.md',
            existed: true,
            contentBase64: Buffer.from('previous content\n').toString('base64'),
          },
        ],
        appliedAt: '2026-09-12T00:00:00.000Z',
        status: 'applied',
      },
    ],
  }
}

async function readme(root: string): Promise<string> {
  return readFile(join(root, 'README.md'), 'utf8')
}

async function journalExists(root: string): Promise<boolean> {
  return readFile(join(root, JOURNAL_FILE), 'utf8').then(
    () => true,
    () => false,
  )
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('rollbackLastApply: on which branch reverting is allowed', () => {
  it('reverts on the branch apply wrote on', async () => {
    const root = await createRepoWithJournal(journalWritingReadme('chore/setup-ai-governance'))

    const result = await rollbackLastApply(root, {
      currentBranch: 'chore/setup-ai-governance',
      currentCommit: WRITTEN_COMMIT,
    })

    expect(result.restoredFiles).toBe(1)
    expect(await readme(root)).toBe('previous content\n')
    expect(await journalExists(root)).toBe(false)
  })

  it('refuses on another branch, without writing and keeping the journal', async () => {
    const root = await createRepoWithJournal(journalWritingReadme('chore/setup-ai-governance'))

    await expect(
      rollbackLastApply(root, { currentBranch: 'Prod', currentCommit: WRITTEN_COMMIT }),
    ).rejects.toThrow(RollbackError)

    expect(await readme(root)).toBe('current content\n')
    expect(await journalExists(root)).toBe(true)
  })

  it('the message says which branch was written on and how to go back', async () => {
    const root = await createRepoWithJournal(journalWritingReadme('chore/setup-ai-governance'))

    await expect(
      rollbackLastApply(root, { currentBranch: 'Prod', currentCommit: WRITTEN_COMMIT }),
    ).rejects.toThrow(
      /"chore\/setup-ai-governance"[\s\S]*"Prod"[\s\S]*git checkout chore\/setup-ai-governance/,
    )
  })

  /**
   * F0-29. With a detached HEAD there is no name to compare, but there is a
   * commit, and the commit is what identifies the site since F0-30. Refusing
   * here left the journal irreversible forever.
   */
  it('reverts with a detached HEAD if the journal was detached too, on the same commit', async () => {
    const root = await createRepoWithJournal(journalWritingReadme(null))

    const result = await rollbackLastApply(root, { currentBranch: null, currentCommit: WRITTEN_COMMIT })

    expect(result.restoredFiles).toBe(1)
    expect(await readme(root)).toBe('previous content\n')
    expect(await journalExists(root)).toBe(false)
  })

  it('refuses on a branch if the journal was written with a detached HEAD, even on the same commit', async () => {
    const root = await createRepoWithJournal(journalWritingReadme(null))

    await expect(
      rollbackLastApply(root, { currentBranch: 'Prod', currentCommit: WRITTEN_COMMIT }),
    ).rejects.toThrow(new RegExp(`desacoplado[\\s\\S]*"Prod"[\\s\\S]*git checkout --detach ${WRITTEN_COMMIT}`))

    expect(await readme(root)).toBe('current content\n')
    expect(await journalExists(root)).toBe(true)
  })

  it('refuses if the journal records neither branch nor commit: there is no site to check', async () => {
    const root = await createRepoWithJournal({
      ...(journalWritingReadme(null) as Record<string, unknown>),
      writtenOnCommit: null,
    })

    await expect(
      rollbackLastApply(root, { currentBranch: null, currentCommit: null }),
    ).rejects.toThrow(RollbackError)

    expect(await readme(root)).toBe('current content\n')
    expect(await journalExists(root)).toBe(true)
  })

  it('refuses if the journal was written by a version that did not record the site', async () => {
    const root = await createRepoWithJournal({
      ...(journalWritingReadme(null, 1) as Record<string, unknown>),
      writtenOnBranch: undefined,
      branch: 'Prod',
    })

    await expect(
      rollbackLastApply(root, { currentBranch: 'Prod', currentCommit: WRITTEN_COMMIT }),
    ).rejects.toThrow(OutdatedJournalError)

    expect(await readme(root)).toBe('current content\n')
    expect(await journalExists(root)).toBe(true)
  })
})

/**
 * F0-30: the name labels the site, the commit identifies it. The cases with
 * real git —recreated branch, commit on top of the `apply`— are in
 * `packages/cli/test/rollback-branch.test.ts`.
 */
describe('rollbackLastApply: on which commit reverting is allowed', () => {
  it('refuses on the same branch if it points to another commit', async () => {
    const root = await createRepoWithJournal(journalWritingReadme('chore/setup-ai-governance'))

    await expect(
      rollbackLastApply(root, {
        currentBranch: 'chore/setup-ai-governance',
        currentCommit: '0000000000000000000000000000000000000000',
      }),
    ).rejects.toThrow(RollbackError)

    expect(await readme(root)).toBe('current content\n')
    expect(await journalExists(root)).toBe(true)
  })

  it('the message names both commits and does not send you back to a branch you are already on', async () => {
    const root = await createRepoWithJournal(journalWritingReadme('chore/setup-ai-governance'))

    await expect(
      rollbackLastApply(root, {
        currentBranch: 'chore/setup-ai-governance',
        currentCommit: '0000000000000000000000000000000000000000',
      }),
    ).rejects.toThrow(
      new RegExp(`${WRITTEN_COMMIT}[\\s\\S]*0000000000000000000000000000000000000000`),
    )
  })

  it('reverts in a repository that had no commit and still has none', async () => {
    const root = await createRepoWithJournal({
      ...(journalWritingReadme('Prod') as Record<string, unknown>),
      writtenOnCommit: null,
    })

    const result = await rollbackLastApply(root, { currentBranch: 'Prod', currentCommit: null })

    expect(result.restoredFiles).toBe(1)
    expect(await readme(root)).toBe('previous content\n')
  })

  it('refuses with a v2 journal, which recorded the branch but not the commit', async () => {
    const root = await createRepoWithJournal({
      ...(journalWritingReadme('Prod', 2) as Record<string, unknown>),
      writtenOnCommit: undefined,
    })

    await expect(
      rollbackLastApply(root, { currentBranch: 'Prod', currentCommit: WRITTEN_COMMIT }),
    ).rejects.toThrow(OutdatedJournalError)

    expect(await readme(root)).toBe('current content\n')
    expect(await journalExists(root)).toBe(true)
  })
})
