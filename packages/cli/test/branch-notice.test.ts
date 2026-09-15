import { describe, expect, it } from 'vitest'
import { branchReturnNotice } from '../src/branch-notice.js'

/**
 * Item 2 of F0-24, the decision alone. The two end-to-end cases —an `apply`
 * failure with EACCES and `rollback`— are in `branch-notice.e2e.test.ts`; here
 * go the combinations that cannot be triggered without setting up a detached
 * HEAD, and the case where **nothing must be said**, which is the one that
 * breaks when the notice is written with no condition.
 */

const ISOLATED = 'chore/setup-ai-governance'

const STARTED_COMMIT = '9f1c0d3a8b7e6f5d4c3b2a1908f7e6d5c4b3a219'

function notice(currentBranch: string | null, startedOnBranch: string | null): string {
  return branchReturnNotice({
    currentBranch,
    startedOnBranch,
    startedOnCommit: STARTED_COMMIT,
    isolatedBranch: ISOLATED,
    pendingRollback: false,
  }).join('\n')
}

/** The case where `apply` failed and could **not** revert: half-done work is left. */
function noticePending(currentBranch: string | null, startedOnBranch: string | null): string {
  return branchReturnNotice({
    currentBranch,
    startedOnBranch,
    startedOnCommit: STARTED_COMMIT,
    isolatedBranch: ISOLATED,
    pendingRollback: true,
  }).join('\n')
}

describe('branchReturnNotice', () => {
  it('stays silent when the repository was left where it was', () => {
    expect(notice('Prod', 'Prod')).toBe('')
  })

  it('stays silent with a detached HEAD too, if it started that way', () => {
    expect(notice(null, null)).toBe('')
  })

  it('says where you are, how to go back and that the isolated branch is left over', () => {
    const text = notice(ISOLATED, 'Prod')

    expect(text).toContain(`Sigues en la rama "${ISOLATED}"`)
    expect(text).toContain('git checkout Prod')
    expect(text).toContain(`git branch -d ${ISOLATED}`)
  })

  it('does not propose deleting a branch that is not the isolated one', () => {
    const text = notice('other-branch', 'Prod')

    expect(text).toContain('git checkout Prod')
    expect(text).not.toContain('git branch -d')
  })

  it('warns that HEAD was left detached', () => {
    const text = notice(null, 'Prod')

    expect(text).toContain('desacoplado')
    expect(text).toContain('git checkout Prod')
  })

  it('does not invent a branch to go back to if the work started with a detached HEAD', () => {
    const text = notice(ISOLATED, null)

    expect(text).toContain(`Sigues en la rama "${ISOLATED}"`)
    // The only `git checkout` back is to the recorded commit (F0-30): there is
    // no branch to name, and there used to be an unfilled `<commit>` here.
    expect(text).toContain(`git checkout ${STARTED_COMMIT}`)
    expect(text).not.toMatch(new RegExp(`git checkout (?!${STARTED_COMMIT})`))
  })
})

/**
 * Blocking finding of the review of PR #11. When `apply` fails and the automatic
 * revert **also** fails, the tree has half-written files and the journal is still
 * alive. The previous notice proposed the two things that close the only way
 * out:
 *
 *  - `git checkout <starting branch>` drags the half-written files to the other
 *    branch: the same contamination item 1 of F0-24 fixes.
 *  - `git branch -d <isolated branch>` works, because `apply` never commits. And
 *    without that branch `assertSameBranch` can never be satisfied: the rollback
 *    the previous line asked for becomes impossible forever.
 */
describe('branchReturnNotice with a pending rollback', () => {
  it('proposes neither going back nor deleting: revert first, then go back', () => {
    const text = noticePending(ISOLATED, 'Prod')

    expect(text).toContain(`Sigues en la rama "${ISOLATED}"`)
    expect(text).toContain('plumbward rollback')
    expect(text).not.toContain('git branch -d')
    // The `git checkout` can only appear after the rollback, never before.
    expect(text.indexOf('plumbward rollback')).toBeLessThan(text.indexOf('git checkout Prod'))
  })

  it('warns that deleting the isolated branch makes the rollback impossible', () => {
    expect(noticePending(ISOLATED, 'Prod')).toMatch(/No borres[\s\S]*rollback/)
  })

  it('does not call a tree with half-written files "unchanged"', () => {
    expect(noticePending(ISOLATED, 'Prod')).not.toContain('sin cambios')
  })

  it('stays silent all the same if the branch did not change: nothing to say about branches', () => {
    expect(noticePending('Prod', 'Prod')).toBe('')
  })
})

/**
 * F0-30, item 3: without the recorded commit the advice was `git checkout
 * <commit>`, a gap the reader can no longer fill: HEAD has been on the isolated
 * branch since `apply` created it, and the starting commit is nowhere to be seen.
 */
describe('branchReturnNotice when the work started with a detached HEAD', () => {
  it('names the starting commit instead of a gap', () => {
    const text = notice(ISOLATED, null)

    expect(text).toContain(`git checkout ${STARTED_COMMIT}`)
    expect(text).not.toContain('<commit>')
  })

  it('with a pending rollback too, after the rollback', () => {
    const text = noticePending(ISOLATED, null)

    expect(text).toContain(`git checkout ${STARTED_COMMIT}`)
    expect(text.indexOf('plumbward rollback')).toBeLessThan(
      text.indexOf(`git checkout ${STARTED_COMMIT}`),
    )
  })

  it('with no commit at all in the repository, does not invent one to go back to', () => {
    const text = branchReturnNotice({
      currentBranch: ISOLATED,
      startedOnBranch: null,
      startedOnCommit: null,
      isolatedBranch: ISOLATED,
      pendingRollback: false,
    }).join('\n')

    expect(text).not.toContain('<commit>')
    expect(text).toContain('no tenía ningún commit')
  })
})
