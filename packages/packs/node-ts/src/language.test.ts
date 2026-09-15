import { describe, expect, it } from 'vitest'
import { recommendedProfile } from '@plumbward/packs-sdk'
import type { Profile, RepoContext } from '@plumbward/packs-sdk'
import type { RepoScan } from '@plumbward/scanner'
import { nodeTsPack } from './index.js'

/**
 * Language of the files the Node pack generates for the client (F0-45).
 *
 * English by default; Spanish only with `language: es`. The files the pack
 * still generates only in Spanish (workflows, hooks, tool configurations) join
 * `BILINGUAL_FILES` when they get their English variant.
 */
const BILINGUAL_FILES = [
  '.cursorrules',
  'CLAUDE.md',
  'AGENTS.md',
  '.github/copilot-instructions.md',
  'GOVERNANCE.md',
]

/**
 * Signs of Spanish: the characters only Spanish uses among the languages we
 * write, and frequent Spanish words that carry no accent, which the repository
 * control (`scripts/english-only.mjs`) does not see. Escaped so this file
 * passes that control.
 */
const SPANISH =
  /[\u00f1\u00d1\u00bf\u00a1\u00e1\u00e9\u00ed\u00f3\u00fa\u00c1\u00c9\u00cd\u00d3\u00da]|(?<!\p{L})(?:de|del|el|la|las|los|que|para|por|con|sin|una|se|al|su|sus|pero|como|cuando|este|esta|\u0072eglas|\u0070ruebas)(?!\p{L})/iu

function scanWith(mode: Profile['mode'], typescript: boolean): RepoScan {
  const stack = {
    id: 'node-ts',
    name: 'Node.js / TypeScript',
    confidence: 0.9,
    evidence: ['package.json'],
    packageManager: 'pnpm' as const,
    frameworks: typescript ? ['next'] : [],
    typescript,
  }
  return {
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
    sloc: { total: 1200, filesScanned: 30, byLanguage: [], sizeClass: 'small', mode },
    stacks: [stack],
    primaryStack: stack,
    maturity: { score: 0, signals: [], missing: [] },
    isMonorepo: false,
    files: ['package.json'],
  }
}

/**
 * Every bilingual file the pack generates, across the variations that change
 * their text: mode, strictness, TypeScript and each operating limit.
 */
async function generated(changes: Partial<Profile>): Promise<{ path: string; variant: string; content: string }[]> {
  const out: { path: string; variant: string; content: string }[] = []
  for (const mode of ['greenfield', 'ratchet', 'non-disruptive'] as const) {
    for (const typescript of [true, false]) {
      for (const limits of [true, false]) {
        const scan = scanWith(mode, typescript)
        const recommended = recommendedProfile(scan)
        const profile: Profile = {
          ...recommended,
          mode,
          strictness: mode === 'greenfield' ? 'strict' : 'moderate',
          aiAssistants: ['cursor', 'claude', 'agents', 'copilot'],
          agentBoundaries: { git: limits, database: limits, commitLanguage: 'en' },
          ...changes,
        }
        const context: RepoContext = { scan, profile, cliVersion: 'test' }
        const variant = `${mode}, typescript=${typescript}, limits=${limits}`
        for (const op of await nodeTsPack.contribute(context)) {
          if (op.kind === 'createFile' && BILINGUAL_FILES.includes(op.path)) {
            out.push({ path: op.path, variant, content: op.content })
          }
        }
      }
    }
  }
  return out
}

function spanishIn(content: string): string | undefined {
  for (const [i, line] of content.split('\n').entries()) {
    const found = SPANISH.exec(line)
    if (found) return `line ${i + 1}: "${found[0]}" in "${line.trim()}"`
  }
  return undefined
}

describe('language of the generated files', () => {
  it('generates every bilingual file, so the checks below do not pass without looking', async () => {
    const paths = new Set((await generated({})).map((entry) => entry.path))
    expect([...paths].sort()).toEqual([...BILINGUAL_FILES].sort())
  })

  it('writes no Spanish with the default profile', async () => {
    const found = (await generated({})).flatMap(({ path, variant, content }) => {
      const evidence = spanishIn(content)
      return evidence ? [`${path} (${variant}) ${evidence}`] : []
    })
    expect(found).toEqual([])
  })

  it('keeps writing Spanish with language: es', async () => {
    const withoutSpanish = (await generated({ language: 'es' }))
      .filter(({ content }) => spanishIn(content) === undefined)
      .map(({ path, variant }) => `${path} (${variant})`)
    expect(withoutSpanish).toEqual([])
  })
})
