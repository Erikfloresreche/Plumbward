import { describe, expect, it } from 'vitest'
import { ciPushBranches, isWorkBranch, requiresIsolation } from './branches.js'

/** Minimal profile: only `branches` matters. */
function profileWith(
  branches: { integration?: string | null; release?: string | null; staging?: string | null } = {},
) {
  return { branches: { integration: null, release: null, staging: null, ...branches } }
}

function head(branch: string | null, options: { detached?: boolean; defaultBranch?: string | null } = {}) {
  return { branch, detachedHead: options.detached ?? false, defaultBranch: options.defaultBranch ?? null }
}

describe('work branches', () => {
  it('recognises the usual prefixes, case-insensitively', () => {
    for (const name of ['feat/login', 'fix/f0-protected-branches', 'chore/setup-ai-governance', 'Feature/X', 'hotfix/urgent', 'dependabot/npm/x', 'claude/add-lint', 'copilot/fix-1', 'codex/task', 'cursor/x']) {
      expect(isWorkBranch(name), name).toBe(true)
    }
  })

  it('does not mistake long-lived branches or names without a prefix for work', () => {
    for (const name of ['Prod', 'pro', 'pre', 'live', 'main', 'release/prod', 'env/production', 'featured', 'feat', 'feat/', '/fix']) {
      expect(isWorkBranch(name), name).toBe(false)
    }
  })
})

describe('must the work be isolated?', () => {
  it('yes, on any branch that is not clearly a work branch, whether listed or not', () => {
    for (const name of ['Prod', 'pro', 'pre', 'live', 'staging', 'release/prod', 'user-patch-1']) {
      expect(requiresIsolation(head(name), profileWith()), name).toBe(true)
    }
  })

  it('no, on a work branch', () => {
    expect(requiresIsolation(head('feat/login'), profileWith())).toBe(false)
  })

  it('yes, with a detached HEAD', () => {
    expect(requiresIsolation(head(null, { detached: true }), profileWith())).toBe(true)
  })

  it('yes, if the team configured a work-looking branch as long-lived', () => {
    // Unlikely, but explicit configuration overrides the convention.
    const profile = profileWith({ integration: 'feat/integration' })
    expect(requiresIsolation(head('feat/integration'), profile)).toBe(true)
  })

  it('yes, if the work-looking branch is the default branch of the remote', () => {
    expect(requiresIsolation(head('feat/main', { defaultBranch: 'feat/main' }), profileWith())).toBe(true)
  })

  it('configured branches are compared case-insensitively', () => {
    // The configured name is upper case and the branch lower case: this proves
    // that both sides are normalised, not only the current branch.
    expect(requiresIsolation(head('feat/x'), profileWith({ release: 'FEAT/X' }))).toBe(true)
  })
})

describe('branches the CI runs on when pushing', () => {
  it('come only from the profile, in order and without case duplicates', () => {
    expect(ciPushBranches(profileWith({ integration: 'main', release: 'Prod', staging: 'pre' }))).toEqual([
      'main',
      'Prod',
      'pre',
    ])
    expect(ciPushBranches(profileWith({ integration: 'prod', release: 'Prod' }))).toEqual(['prod'])
  })

  it('with no configured branches returns an empty list, and the CI only checks PRs', () => {
    expect(ciPushBranches(profileWith())).toEqual([])
  })
})
