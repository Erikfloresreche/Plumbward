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
const spanish: Profile = { ...base, language: 'es' }

function withBoundaries(overrides: Partial<Profile['agentBoundaries']>, profile: Profile = base): Profile {
  return { ...profile, agentBoundaries: { ...profile.agentBoundaries, ...overrides } }
}

describe('operating limits in the generated AI rules', () => {
  it('forbids git and database by default, and asks for commits in English', () => {
    const rules = aiRules(scan, base)

    expect(rules).toContain('Git commands that change state')
    expect(rules).toContain('Database commands that write')
    expect(rules).toContain('are always written in\nEnglish')
  })

  it('explicitly allows the read-only commands', () => {
    const rules = aiRules(scan, base)

    // If this disappears, the assistant can no longer read the state of the
    // repo and the rule becomes unusable in practice.
    expect(rules).toContain('You may use the read-only ones')
    expect(rules).toContain('You may run inspection `SELECT`s')
  })

  it('respects disabling each limit separately', () => {
    const withoutGit = aiRules(scan, withBoundaries({ git: false }))
    expect(withoutGit).not.toContain('Git commands that change state')
    expect(withoutGit).toContain('Database commands that write')

    const withoutAny = aiRules(scan, withBoundaries({ git: false, database: false }))
    expect(withoutAny).not.toContain('Database commands that write')
  })

  it('keeps the section numbering even with everything disabled', () => {
    const withoutAny = aiRules(scan, withBoundaries({ git: false, database: false }))

    // The commit language rule always applies, so section 7 never disappears
    // and section 8 is never orphaned.
    expect(withoutAny).toContain('## 7. What you must NOT run')
    expect(withoutAny).toContain('## 8. What you must NEVER do')
  })

  it('names the commit language the profile sets, independently of the output language', () => {
    expect(aiRules(scan, withBoundaries({ commitLanguage: 'es' }))).toContain('are always written in\nSpanish')
    expect(copilotInstructions(scan, withBoundaries({ commitLanguage: 'es' }))).toContain('branch names in Spanish')
  })

  it('also requires branch names in the language of the history', () => {
    const rules = aiRules(scan, base)

    // The branch name stays in the history just like the commit: if one is in
    // English and the other is not, the history ends up mixing languages.
    expect(rules).toContain('and branch names are always written in')
    expect(rules).toContain('fix/protected-branch-detection')
    expect(copilotInstructions(scan, base)).toContain('branch names in English')
  })

  it('carries the same limits to the Copilot instructions', () => {
    const copilot = copilotInstructions(scan, base)

    expect(copilot).toContain('Do not run git commands that change state')
    expect(copilot).toContain('Do not run migrations')
    expect(copilot).toContain('in English')
  })
})

describe('operating limits in the Spanish variant (language: es)', () => {
  it('forbids git and database, and asks for commits in English', () => {
    const rules = aiRules(scan, spanish)

    expect(rules).toContain('Comandos de git que modifican el estado')
    expect(rules).toContain('Comandos de base de datos que escriben')
    expect(rules).toContain('se redactan siempre\nen inglés')
    expect(rules).toContain('## 7. Lo que NO debes ejecutar')
    // The body too, not only the limits section: both are chosen by language.
    expect(rules).toContain('## 2. Antes de escribir')
    expect(rules).not.toContain('## 2. Before writing code')
  })

  it('explicitly allows the read-only commands', () => {
    const rules = aiRules(scan, spanish)

    expect(rules).toContain('Sí puedes usar los de sólo lectura')
    expect(rules).toContain('Sí puedes hacer `SELECT` de inspección')
  })

  it('translates the commit language when the profile changes it', () => {
    const inSpanish = aiRules(scan, withBoundaries({ commitLanguage: 'es' }, spanish))
    expect(inSpanish).toContain('se redactan siempre\nen español')
  })

  it('also requires branch names in the language of the history', () => {
    expect(aiRules(scan, spanish)).toContain('los nombres de rama se redactan siempre')
    expect(copilotInstructions(scan, spanish)).toContain('los nombres de rama en inglés')
  })

  it('carries the same limits to the Copilot instructions', () => {
    const copilot = copilotInstructions(scan, spanish)

    expect(copilot).toContain('No ejecutes comandos git que modifiquen el estado')
    expect(copilot).toContain('No ejecutes migraciones')
    expect(copilot).toContain('en inglés')
  })
})
