import { describe, expect, it } from 'vitest'
import { PlanBuilder, isBlocked, isEmpty, operationPath } from './plan.js'
import type { Operation } from './types.js'

/**
 * `PlanBuilder` is where the operations of every pack meet. The clash between
 * two packs that want the same target in different ways had no test (F0-7).
 */

const readme = (content: string): Operation => ({
  kind: 'createFile',
  path: 'README.md',
  content,
  managed: false,
  reason: 'test',
})

describe('PlanBuilder', () => {
  it('ignores an exact duplicate from another pack', () => {
    const plan = new PlanBuilder('en').add('a', [readme('x')]).add('b', [readme('x')]).build()

    expect(plan.operations).toHaveLength(1)
    expect(plan.conflicts).toEqual([])
    expect(plan.contributors).toEqual(['a', 'b'])
  })

  it('keeps the first operation and warns when two packs disagree on a target', () => {
    const plan = new PlanBuilder('en').add('a', [readme('x')]).add('b', [readme('y')]).build()

    expect(plan.operations).toEqual([readme('x')])
    expect(plan.conflicts).toEqual([
      {
        path: 'README.md',
        reason: 'Packs "a" and "b" want to configure the same thing in different ways.',
        severity: 'warn',
      },
    ])
    expect(plan.summary.conflicts).toBe(1)
    expect(isBlocked(plan)).toBe(false)
  })

  it('a clash between commands is reported under its key, since it has no path', () => {
    const run = (reason: string): Operation => ({
      kind: 'execCommand',
      cmd: 'tool',
      args: ['init'],
      reason,
    })

    const plan = new PlanBuilder('en').add('a', [run('one')]).add('b', [run('two')]).build()

    expect(plan.conflicts[0]?.path).toBe('exec:tool:init')
  })

  it('a recorded blocking conflict blocks the plan', () => {
    const plan = new PlanBuilder('en')
      .conflict({ path: 'x', reason: 'cannot', severity: 'block' })
      .build()

    expect(isBlocked(plan)).toBe(true)
    expect(isEmpty(plan)).toBe(true)
  })

  it('counts each modified file once, however many patches touch it', () => {
    const patch = (pointer: string): Operation => ({
      kind: 'patchJson',
      path: 'package.json',
      pointer,
      value: 1,
      strategy: 'set',
      reason: 'test',
    })

    const plan = new PlanBuilder('en').add('a', [patch('/a'), patch('/b'), readme('x')]).build()

    expect(plan.summary).toMatchObject({ filesCreated: 1, filesModified: 1 })
    expect(isEmpty(plan)).toBe(false)
  })
})

describe('operationPath', () => {
  it('is undefined for operations that touch no file', () => {
    expect(
      operationPath({ kind: 'addDependency', manager: 'npm', name: 'x', dev: true, reason: '' }),
    ).toBeUndefined()
  })
})
