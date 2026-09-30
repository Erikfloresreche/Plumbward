import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { matrixConditionProblems, readWorkflows, triggerBranchProblems } from './workflow-checks.mjs'

const ci = { path: '.github/workflows/ci.yml', text: "matrix:\n  node: ['22.13', '24']\nsteps:\n  - if: matrix.node == '22.13'\n" }

describe('matrix conditions', () => {
  it('accepts a condition on a version of the matrix', () => {
    expect(matrixConditionProblems([ci])).toEqual([])
  })

  it('looks at every workflow, not only ci.yml', () => {
    const other = { path: '.github/workflows/other.yml', text: "matrix:\n  node: ['24']\nsteps:\n  - if: matrix.node == '22'\n" }
    expect(matrixConditionProblems([ci, other])).toEqual([
      `.github/workflows/other.yml has a condition "matrix.node == '22'" but the matrix is [24]. That step would never run.`,
    ])
  })

  it('reports a condition in a workflow with no matrix', () => {
    const other = { path: '.github/workflows/other.yml', text: "steps:\n  - if: matrix.node == '22'\n" }
    expect(matrixConditionProblems([other])).toHaveLength(1)
  })

  it('does not count a comment that quotes the pattern', () => {
    const other = { path: 'x.yml', text: "# used to be if: matrix.node == '22'\n" }
    expect(matrixConditionProblems([other])).toEqual([])
  })
})

describe('trigger branches', () => {
  const wf = { path: 'x.yml', text: 'on:\n  pull_request:\n    branches: [develop, prod]\n' }

  it('reports a branch that does not exist, with the case diagnosed', () => {
    const { skipped, problems } = triggerBranchProblems(() => [wf], () => ['develop', 'Prod'])
    expect(skipped).toBe(false)
    expect(problems).toEqual([expect.stringContaining('the remote branch is called "Prod"')])
  })

  it('skips without failing when the remote cannot be listed', () => {
    const noNetwork = () => {
      throw new Error('offline')
    }
    expect(triggerBranchProblems(() => [wf], noNetwork)).toEqual({ skipped: true, problems: [] })
  })

  it('does not pass off unreadable workflows as a network failure', () => {
    // The listing of workflows was inside the network `try`: an unreadable
    // directory switched the control off and blamed the remote.
    const unreadable = () => {
      throw new Error('EACCES: .github/workflows')
    }
    expect(() => triggerBranchProblems(unreadable, () => ['develop'])).toThrow(/EACCES/)
  })
})

describe('workflow listing', () => {
  it('reads every .yml and .yaml, sorted, and nothing else', () => {
    const root = mkdtempSync(join(tmpdir(), 'workflows-'))
    mkdirSync(join(root, '.github/workflows'), { recursive: true })
    for (const f of ['b.yml', 'a.yaml', 'notes.md']) writeFileSync(join(root, '.github/workflows', f), f)
    expect(readWorkflows(root)).toEqual([
      { path: '.github/workflows/a.yaml', text: 'a.yaml' },
      { path: '.github/workflows/b.yml', text: 'b.yml' },
    ])
  })

  it('throws if the directory cannot be read, instead of returning no workflows', () => {
    const root = mkdtempSync(join(tmpdir(), 'workflows-'))
    expect(() => readWorkflows(root)).toThrow(/ENOENT/)
  })
})
