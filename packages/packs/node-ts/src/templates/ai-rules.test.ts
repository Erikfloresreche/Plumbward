import { describe, expect, it } from 'vitest'
import { recommendedProfile } from '@plumbward/packs-sdk'
import type { Profile } from '@plumbward/packs-sdk'
import type { RepoScan } from '@plumbward/scanner'
import { aiRules, copilotInstructions } from './ai-rules.js'

/**
 * Minimal but complete scan: building it by hand instead of scanning a real
 * repository keeps the test fast and deterministic.
 */
const scan: RepoScan = {
  repoRoot: '/tmp/project',
  git: {
    isRepo: true,
    branch: 'main',
    detachedHead: false,
    branches: ['main'],
    defaultBranch: 'main',
    isDirty: false,
    rootCommit: 'abc123',
    remoteUrl: null,
    fingerprint: 'abc123',
  },
  sloc: {
    total: 1200,
    filesScanned: 30,
    byLanguage: [{ language: 'TypeScript', files: 30, sloc: 1200 }],
    sizeClass: 'small',
    mode: 'greenfield',
  },
  stacks: [
    {
      id: 'node-ts',
      name: 'Node.js / TypeScript',
      confidence: 0.9,
      evidence: ['package.json'],
      packageManager: 'pnpm',
      frameworks: [],
      typescript: true,
    },
  ],
  primaryStack: {
    id: 'node-ts',
    name: 'Node.js / TypeScript',
    confidence: 0.9,
    evidence: ['package.json'],
    packageManager: 'pnpm',
    frameworks: [],
    typescript: true,
  },
  maturity: { score: 0, signals: [], missing: [] },
  isMonorepo: false,
  files: ['package.json'],
}

const base: Profile = recommendedProfile(scan)

function withBoundaries(overrides: Partial<Profile['agentBoundaries']>): Profile {
  return { ...base, agentBoundaries: { ...base.agentBoundaries, ...overrides } }
}

describe('operating limits in the generated AI rules', () => {
  it('forbids git and database by default, and asks for commits in English', () => {
    const rules = aiRules(scan, base)

    expect(rules).toContain('Comandos de git que modifican el estado')
    expect(rules).toContain('Comandos de base de datos que escriben')
    expect(rules).toContain('se redactan siempre\nen inglés')
  })

  it('explicitly allows the read-only commands', () => {
    const rules = aiRules(scan, base)

    // If this disappears, the assistant can no longer read the state of the
    // repo and the rule becomes unusable in practice.
    expect(rules).toContain('Sí puedes usar los de sólo lectura')
    expect(rules).toContain('Sí puedes hacer `SELECT` de inspección')
  })

  it('respects disabling each limit separately', () => {
    const withoutGit = aiRules(scan, withBoundaries({ git: false }))
    expect(withoutGit).not.toContain('Comandos de git que modifican el estado')
    expect(withoutGit).toContain('Comandos de base de datos que escriben')

    const withoutAny = aiRules(scan, withBoundaries({ git: false, database: false }))
    expect(withoutAny).not.toContain('Comandos de base de datos que escriben')
  })

  it('keeps the section numbering even with everything disabled', () => {
    const withoutAny = aiRules(scan, withBoundaries({ git: false, database: false }))

    // The commit language rule always applies, so section 7 never disappears
    // and section 8 is never orphaned.
    expect(withoutAny).toContain('## 7. Lo que NO debes ejecutar')
    expect(withoutAny).toContain('## 8. Lo que NUNCA debes hacer')
  })

  it('translates the commit language when the profile changes it', () => {
    const inSpanish = aiRules(scan, withBoundaries({ commitLanguage: 'es' }))
    expect(inSpanish).toContain('se redactan siempre\nen español')
  })

  it('also requires branch names in the language of the history', () => {
    const rules = aiRules(scan, base)

    // The branch name stays in the history just like the commit: if one is in
    // English and the other is not, the history ends up mixing languages.
    expect(rules).toContain('los nombres de rama se redactan siempre')
    expect(rules).toContain('fix/protected-branch-detection')
    expect(copilotInstructions(scan, base)).toContain('los nombres de rama en inglés')
  })

  it('carries the same limits to the Copilot instructions', () => {
    const copilot = copilotInstructions(scan, base)

    expect(copilot).toContain('No ejecutes comandos git que modifiquen el estado')
    expect(copilot).toContain('No ejecutes migraciones')
    expect(copilot).toContain('en inglés')
  })
})
