import { describe, expect, it } from 'vitest'

import { isFailure, label, mutationOutcome } from './mutation-outcome.mjs'

describe('verdict of a run against a mutation', () => {
  it('the tests ran and one failed: the mutation is caught', () => {
    expect(mutationOutcome({ status: 1 })).toBe('detected')
  })

  it('the tests ran and all passed: the mutation survives', () => {
    expect(mutationOutcome({ status: 0 })).toBe('survived')
  })

  it('the process could not be launched: not a detection', () => {
    // `pnpm` off the PATH, or a half-done `install`. It used to give `detected`
    // because `null !== 0`, and the 30 mutations came out green without running
    // a single test.
    expect(mutationOutcome({ status: null, error: new Error('spawn ENOENT') })).toBe('not-run')
  })

  it('the timeout fired: not a detection', () => {
    expect(mutationOutcome({ status: null })).toBe('not-run')
  })

  it('only a detection leaves the CI green', () => {
    expect(isFailure('detected')).toBe(false)
    expect(isFailure('survived')).toBe(true)
    expect(isFailure('not-run')).toBe(true)
  })

  it('every verdict has a label and all have the same width', () => {
    const labels = ['detected', 'survived', 'not-run'].map(label)
    expect(labels.every((e) => e !== undefined)).toBe(true)
    expect(new Set(labels.map((e) => e.length)).size).toBe(1)
  })
})
