import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { parseYamlToJson } from '@plumbward/ast'
import type { Operation } from '@plumbward/core'
import { PackRegistry, recommendedProfile } from '@plumbward/packs-sdk'
import type { OutputLanguage, Profile, RepoContext } from '@plumbward/packs-sdk'
import type { RepoScan } from '@plumbward/scanner'
import { nodeTsPack } from './index.js'

/**
 * Language of the files the Node pack generates for the client (F0-45).
 *
 * English by default; Spanish only with `language: es`. Every text the pack
 * writes into the client repository is listed here: whole files, managed
 * blocks (`path#blockId`) and JSON patches (`path#pointer`).
 */
const BILINGUAL_FILES = [
  '.editorconfig',
  'Makefile',
  '.github/workflows/ci-dev.yml',
  '.github/workflows/ci-staging.yml',
  '.github/workflows/ci-prod.yml',
  '.gitleaks.toml',
  '.husky/pre-commit',
  '.husky/commit-msg',
  'commitlint.config.js',
  'eslint.config.js',
  '.cursorrules',
  'CLAUDE.md',
  'AGENTS.md',
  '.github/copilot-instructions.md',
  '.devcontainer/devcontainer.json',
  'GOVERNANCE.md',
  'package.json#/scripts',
  '.gitignore#gitignore-artifacts',
]

/** What the pack writes with no text in it, so it has no language. */
const TEXTLESS_FILES = ['.nvmrc', 'package.json#/lint-staged']

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

/** Key and text of an operation that writes into the repository, if it does. */
function written(op: Operation): { path: string; content: string } | undefined {
  switch (op.kind) {
    case 'createFile':
      return { path: op.path, content: op.content }
    case 'ensureBlock':
      return { path: `${op.path}#${op.blockId}`, content: op.content }
    case 'patchJson':
    case 'patchYaml':
      return { path: `${op.path}#${op.pointer}`, content: JSON.stringify(op.value, null, 2) }
    default:
      return undefined
  }
}

/**
 * Everything the pack writes, across the variations that change its text:
 * mode, strictness, TypeScript and each operating limit. Every branch and the
 * devcontainer are configured, so no file is left out.
 */
async function everything(changes: Partial<Profile>): Promise<{ path: string; variant: string; content: string }[]> {
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
          branches: { integration: 'develop', release: 'main', staging: 'staging' },
          deployTarget: 'vercel',
          devcontainer: true,
          ...changes,
        }
        const context: RepoContext = { scan, profile, cliVersion: 'test' }
        const variant = `${mode}, typescript=${typescript}, limits=${limits}`
        for (const op of await nodeTsPack.contribute(context)) {
          const entry = written(op)
          if (entry) out.push({ ...entry, variant })
        }
      }
    }
  }
  return out
}

/** Every bilingual file the pack generates. */
async function generated(changes: Partial<Profile>): Promise<{ path: string; variant: string; content: string }[]> {
  return (await everything(changes)).filter((entry) => BILINGUAL_FILES.includes(entry.path))
}

/**
 * The name heuristic of the F0-16 file-name control, from
 * `scripts/english-only.mjs`. Loaded at run time: the script is plain
 * JavaScript, outside the TypeScript project.
 */
async function spanishNameEvidence(name: string): Promise<string[]> {
  const script = fileURLToPath(new URL('../../../../scripts/english-only.mjs', import.meta.url))
  const loaded: unknown = await import(/* @vite-ignore */ script)
  if (typeof loaded !== 'object' || loaded === null || !('spanishNameEvidence' in loaded)) {
    throw new Error(`${script} no longer exports spanishNameEvidence`)
  }
  const heuristic = loaded.spanishNameEvidence
  if (typeof heuristic !== 'function') throw new Error('spanishNameEvidence is not a function')
  const evidence: unknown = heuristic(name)
  if (!Array.isArray(evidence)) throw new Error('spanishNameEvidence did not return a list')
  return evidence.map(String)
}

/** `workflow: job id` of every job of the generated workflows. */
async function jobIds(language: OutputLanguage): Promise<string[]> {
  const ids = new Set<string>()
  for (const { path, content } of await generated({ language })) {
    if (!path.startsWith('.github/workflows/')) continue
    const workflow = parseYamlToJson(content)
    const jobs = typeof workflow === 'object' && workflow !== null ? (workflow as Record<string, unknown>)['jobs'] : undefined
    if (typeof jobs !== 'object' || jobs === null) throw new Error(`${path} has no jobs`)
    for (const id of Object.keys(jobs)) ids.add(`${path}: ${id}`)
  }
  return [...ids].sort()
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

  it('lists everything the pack writes, so a new text cannot skip the checks', async () => {
    const paths = new Set((await everything({})).map((entry) => entry.path))
    expect([...paths].sort()).toEqual([...BILINGUAL_FILES, ...TEXTLESS_FILES].sort())
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

  it('carries the profile language into the plan, which plan and apply write headers in', async () => {
    const scan = scanWith('greenfield', true)
    const registry = new PackRegistry([nodeTsPack])
    for (const language of ['en', 'es'] as const) {
      const profile: Profile = { ...recommendedProfile(scan), language }
      const plan = await registry.buildPlan({ scan, profile, cliVersion: 'test' })
      expect(plan.language).toBe(language)
    }
  })
})

describe('job ids of the generated workflows', () => {
  it('are the same in both languages: they are identifiers, not text', async () => {
    const english = await jobIds('en')
    expect(english.length).toBeGreaterThan(0)
    expect(await jobIds('es')).toEqual(english)
  })

  it('do not look Spanish to the file-name heuristic of F0-16', async () => {
    const flagged: string[] = []
    for (const entry of await jobIds('en')) {
      const id = entry.slice(entry.lastIndexOf(': ') + 2)
      if ((await spanishNameEvidence(id)).length > 0) flagged.push(entry)
    }
    expect(flagged).toEqual([])
  })
})
