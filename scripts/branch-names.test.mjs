import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  BRANCH_FORMAT,
  branchExemption,
  branchProblem,
  checkPlan,
  checkPullRequestBranch,
  parsePlan,
  spanishEvidence,
} from './branch-names.mjs'

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')
const corpus = JSON.parse(read('./branch-names-corpus.json'))

describe('branch name format', () => {
  it('accepts the real phases', () => {
    expect(BRANCH_FORMAT.test('fix/f0-branch-control-review')).toBe(true)
    expect(BRANCH_FORMAT.test('feat/f6-launch')).toBe(true)
    expect(BRANCH_FORMAT.test('refactor/f10-something')).toBe(true)
  })

  it('rejects phases with leading zeros or of three digits', () => {
    expect(branchProblem('feat/f00-launch')).toMatch(/format/)
    expect(branchProblem('feat/f999-launch')).toMatch(/format/)
  })

  it('rejects types, uppercase and separators outside the convention', () => {
    expect(branchProblem('feature/f0-launch')).toMatch(/format/)
    expect(branchProblem('feat/f0-Launch')).toMatch(/format/)
    expect(branchProblem('feat/f0--launch')).toMatch(/format/)
    expect(branchProblem('feat/f0-launch-')).toMatch(/format/)
    expect(branchProblem('f0-launch')).toMatch(/format/)
  })

  it('rejects non-ASCII characters before the format', () => {
    expect(branchProblem('feat/f0-versión')).toBe('contains non-ASCII characters')
  })
})

describe('language heuristic over the corpus', () => {
  // The corpus is the 33 names PR #6 renamed and their replacements. The
  // previous heuristic let 15 of the 33 through and rejected two valid English
  // names; that is why the corpus is in the repository and not in the test.
  it.each(corpus.spanish)('rejects the Spanish name %s', (name) => {
    expect(branchProblem(name)).toMatch(/Spanish/)
  })

  it.each(corpus.english)('accepts the English name %s', (name) => {
    expect(branchProblem(name)).toBeUndefined()
  })

  // A known and measured limit, not an oversight: each component is also an
  // English word. If it is ever detected, this test warns to move it.
  it.each(corpus.spanishNotDetected)('does not detect %s, and that is declared', (name) => {
    expect(branchProblem(name)).toBeUndefined()
  })

  it('function words only count between two other components', () => {
    expect(spanishEvidence('de-duplicate')).toEqual([])
    expect(spanishEvidence('y-axis')).toEqual([])
    expect(spanishEvidence('parte-de-algo')).toContain('de')
  })

  it('endings do not collide with short English words', () => {
    expect(spanishEvidence('dad-mode')).toEqual([])
    expect(spanishEvidence('instalacion')).toContain('instalacion')
  })
})

describe('exemptions', () => {
  it('lets a release from develop to Prod through', () => {
    expect(checkPullRequestBranch('develop', 'Erikfloresreche')).toBeUndefined()
    expect(checkPullRequestBranch('Prod', 'Erikfloresreche')).toBeUndefined()
  })

  it('exempts bots by author, not by name prefix', () => {
    expect(checkPullRequestBranch('dependabot/npm_and_yarn/vitest-2', 'dependabot[bot]')).toBeUndefined()
    // The previous back door: the prefix was written by whoever opened the PR.
    expect(checkPullRequestBranch('dependabot/../fix/f0-ramas', 'someone')).toMatch(/format/)
  })

  it('exempts the web editor only when the login in the name is the author', () => {
    expect(checkPullRequestBranch('octocat-patch-1', 'octocat')).toBeUndefined()
    expect(checkPullRequestBranch('octocat-patch-1', 'mallory')).toMatch(/format/)
  })

  it('exempts the Revert button only if the reverted branch was valid', () => {
    expect(checkPullRequestBranch('revert-42-fix/f0-protected-branches', 'octocat')).toBeUndefined()
    expect(checkPullRequestBranch('revert-42-develop', 'octocat')).toBeUndefined()
    expect(checkPullRequestBranch('revert-42-lo-que-sea', 'octocat')).toMatch(/format/)
  })

  it('does not exempt without a known author', () => {
    expect(branchExemption('octocat-patch-1', undefined)).toBeUndefined()
  })

  it('checks nothing if there is no PR branch', () => {
    expect(checkPullRequestBranch(undefined, 'octocat')).toBeUndefined()
  })
})

describe('plan parser', () => {
  const plan = [
    '# Plan',
    '',
    '### [ ] F0-1 — Pending',
    '**Branch:** `fix/f0-pending-task`',
    '',
    '### [X] F0-2 — Closed with a capital X',
    '**Branch:** `fix/f0-ramas-cerradas`',
    '',
    '## Another heading that is not a task',
    '**Branch:** `fix/f0-ramas-huerfanas`',
    '',
  ].join('\n')

  it('recognises [ ], [x] and [X] and counts the tasks', () => {
    const { tasks, declarations, tasksWithoutDeclaration, branches } = parsePlan(plan)
    expect(tasks).toBe(2)
    expect(declarations).toBe(3)
    expect(tasksWithoutDeclaration).toBe(0)
    expect(branches.map((b) => b.pending)).toEqual([true, false, false])
  })

  it('counts as declared the task that says it has no code branch', () => {
    const { tasks, declarations, tasksWithoutDeclaration, branches } = parsePlan(
      '### [ ] F0-1 — No branch\n**Branch:** GitHub configuration, no code branch\n',
    )
    expect({ tasks, declarations, tasksWithoutDeclaration, branches }).toEqual({
      tasks: 1,
      declarations: 1,
      tasksWithoutDeclaration: 0,
      branches: [],
    })
  })

  it('a heading that is not a task closes the previous one', () => {
    // The branch under "## Another heading" is in Spanish, but it does not hang
    // from a pending task: before, the state survived and attributed it to the
    // previous one.
    expect(checkPlan(plan)).toEqual([])
  })

  it('only judges the branches of pending tasks', () => {
    const withSpanishBranch = plan.replace('fix/f0-pending-task', 'fix/f0-ramas-protegidas')
    expect(checkPlan(withSpanishBranch)).toEqual([
      expect.stringContaining('"fix/f0-ramas-protegidas" looks Spanish'),
    ])
  })

  it('fails on a plan with no tasks instead of passing in silence', () => {
    expect(checkPlan('')).toEqual([expect.stringContaining('declares no')])
    expect(checkPlan('### F0-1 — No checkbox\n')).toEqual([
      expect.stringContaining('declares no'),
    ])
  })

  it('fails if some task does not declare its branch', () => {
    const withoutBranch = '### [ ] F0-1 — With branch\n**Branch:** `fix/f0-one`\n\n### [ ] F0-2 — No branch\n'
    expect(checkPlan(withoutBranch)).toEqual([expect.stringContaining('1 of the 2 plan tasks')])
  })

  it('fails if the branch line does not follow a format the parser recognises', () => {
    // The failure that motivated the assertion: the parser skipped the line and
    // the control passed as if the task had no branch to judge.
    const otherFormat = '### [ ] F0-1 — Task\n*Branch*: `fix/f0-ramas-protegidas`\n'
    expect(checkPlan(otherFormat)).toEqual([expect.stringContaining('1 of the 1 plan tasks')])
  })

  it('does not recognise the Spanish branch line the plan used before F0-42', () => {
    const oldFormat = '### [ ] F0-1 — Task\n**Rama:** `fix/f0-ramas-protegidas`\n'
    expect(checkPlan(oldFormat)).toEqual([expect.stringContaining('1 of the 1 plan tasks')])
  })

  it('a branch outside any task does not make up for the task that does not declare it', () => {
    // Regression from the review of PR #10: comparing totals, the line of
    // "## Appendix" balanced the counts and the Spanish name of F0-1 was never
    // judged. It is counted per task, not by totals.
    const masked = [
      '### [ ] F0-1 — With the branch line misspelled',
      '*Branch*: `fix/f0-ramas-protegidas`',
      '',
      '### [ ] F0-2 — Correct',
      '**Branch:** `fix/f0-two`',
      '',
      '## Appendix',
      '**Branch:** `fix/f0-three`',
      '',
    ].join('\n')
    const { tasks, declarations } = parsePlan(masked)
    expect({ tasks, declarations }).toEqual({ tasks: 2, declarations: 2 })
    expect(checkPlan(masked)).toEqual([expect.stringContaining('1 of the 2 plan tasks')])
  })

  it('tolerates different spacing in the branch line', () => {
    const { branches } = parsePlan('### [ ] T\n  **Branch:**   `fix/f0-spaced`\n')
    expect(branches).toEqual([{ name: 'fix/f0-spaced', pending: true }])
  })

  it('the real plan of the repository passes the control', () => {
    expect(checkPlan(read('../docs/EXECUTION_PLAN.md'))).toEqual([])
  })
})
