import { describe, expect, it } from 'vitest'

import { SPANISH_WORDS } from './branch-names.mjs'
import { ALWAYS_ENGLISH, checkEnglishOnly, findSpanish, spanishNameEvidence } from './english-only.mjs'

/**
 * F0-41. Spanish samples are written with `\u` escapes, and the Spanish word
 * comes from the list the control itself uses: this file must pass the control
 * it tests without being an exception.
 */

const SPANISH_CHARACTERS = ['\u00f1', '\u00d1', '\u00bf', '\u00a1', '\u00e1', '\u00e9', '\u00ed', '\u00f3', '\u00fa', '\u00c1', '\u00c9', '\u00cd', '\u00d3', '\u00da']
const WORD = [...SPANISH_WORDS][0]
const SPANISH_LINE = `a\u00f1ade la ${WORD}`

const noLists = { pending: [], exceptions: [] }

describe('findSpanish', () => {
  it.each(SPANISH_CHARACTERS)('detects the Spanish character %s', (char) => {
    expect(findSpanish(`English line\nword${char}word\n`)).toEqual({ line: 2, match: char })
  })

  it('detects a Spanish word as a whole word, in any case', () => {
    expect(findSpanish(`one\ntwo\nthe ${WORD.toUpperCase()} here`)).toEqual({
      line: 3,
      match: WORD.toUpperCase(),
    })
  })

  // One boundary at a time: with letters on both sides, either check hides the
  // absence of the other.
  it('does not detect a Spanish word at the end of a longer English word', () => {
    expect(findSpanish(`the x${WORD} end`)).toBeUndefined()
  })

  it('does not detect a Spanish word at the start of a longer English word', () => {
    expect(findSpanish(`the ${WORD}y end`)).toBeUndefined()
  })

  it('detects a Spanish word inside a snake_case identifier', () => {
    expect(findSpanish(`const x_${WORD}_y = 1`)).toEqual({ line: 1, match: WORD })
  })

  it('does not treat typographic punctuation as Spanish', () => {
    expect(findSpanish('An em dash \u2014 a section \u00a7 and \u201cquotes\u201d.')).toBeUndefined()
  })
})

describe('checkEnglishOnly', () => {
  it('fails for a file with Spanish that is in neither list', () => {
    const problems = checkEnglishOnly([{ path: 'src/a.ts', text: `// ok\n// ${SPANISH_LINE}\n` }], noLists)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('src/a.ts:2')
  })

  it('accepts Spanish in a pending file and in a permanent exception', () => {
    const files = [
      { path: 'a.md', text: SPANISH_LINE },
      { path: 'b.json', text: SPANISH_LINE },
      { path: 'c.md', text: 'English only.' },
    ]
    const lists = { pending: ['a.md'], exceptions: [{ path: 'b.json', reason: 'corpus of Spanish names' }] }
    expect(checkEnglishOnly(files, lists)).toEqual([])
  })

  it('fails for a pending file that no longer has Spanish', () => {
    const problems = checkEnglishOnly([{ path: 'a.md', text: 'Translated.' }], { pending: ['a.md'], exceptions: [] })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('a.md')
  })

  it('fails for an exception that no longer has Spanish', () => {
    const lists = { pending: [], exceptions: [{ path: 'b.json', reason: 'corpus' }] }
    const problems = checkEnglishOnly([{ path: 'b.json', text: 'Translated.' }], lists)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('b.json')
  })

  it('fails for a listed path that is not a tracked file', () => {
    const files = [{ path: 'a.md', text: 'English.' }]
    expect(checkEnglishOnly(files, { pending: ['gone.md'], exceptions: [] })).toHaveLength(1)
    expect(checkEnglishOnly(files, { pending: [], exceptions: [{ path: 'gone.md', reason: 'r' }] })).toHaveLength(1)
  })

  it('fails for a path listed twice', () => {
    const files = [{ path: 'a.md', text: SPANISH_LINE }]
    expect(checkEnglishOnly(files, { pending: ['a.md', 'a.md'], exceptions: [] })).toHaveLength(1)
    expect(
      checkEnglishOnly(files, { pending: ['a.md'], exceptions: [{ path: 'a.md', reason: 'r' }] }),
    ).toHaveLength(1)
  })

  it('fails for an exception without a reason', () => {
    const files = [{ path: 'b.json', text: SPANISH_LINE }]
    expect(checkEnglishOnly(files, { pending: [], exceptions: [{ path: 'b.json', reason: '  ' }] })).toHaveLength(1)
    expect(checkEnglishOnly(files, { pending: [], exceptions: [{ path: 'b.json' }] })).toHaveLength(1)
  })

  it.each(ALWAYS_ENGLISH)('never lets %s be listed, read as it is every session', (path) => {
    const files = [{ path, text: SPANISH_LINE }]
    expect(checkEnglishOnly(files, { pending: [path], exceptions: [] })).not.toEqual([])
    expect(checkEnglishOnly(files, { pending: [], exceptions: [{ path, reason: 'r' }] })).not.toEqual([])
  })

  it('covers the assistant instructions, the runbook and the PR template', () => {
    expect([...ALWAYS_ENGLISH].sort()).toEqual(['.claude/napkin.md', '.github/PULL_REQUEST_TEMPLATE.md', 'CLAUDE.md'])
  })

  it('fails when there are no files to check, instead of passing without looking', () => {
    expect(checkEnglishOnly([], noLists)).toHaveLength(1)
  })

  it('fails for lists with the wrong shape', () => {
    const files = [{ path: 'a.md', text: 'English.' }]
    expect(checkEnglishOnly(files, {})).not.toEqual([])
    expect(checkEnglishOnly(files, { pending: 'a.md', exceptions: [] })).not.toEqual([])
  })
})

describe('file names (F0-16)', () => {
  // The names F0-16 renamed, plus the one created and fixed in the session
  // that agreed the rule. None has an accent or a word of the content list.
  const RENAMED = [
    'scripts/verificar-coherencia.mjs',
    'docs/PLAN_DE_EJECUCION.md',
    'docs/ARQUITECTURA.md',
    'docs/MODELO_DE_NEGOCIO.md',
    'docs/adr/0001-plan-antes-de-aplicar.md',
    'docs/adr/0002-licenciamiento-local-first.md',
    'docs/adr/0003-licencia-busl.md',
    'docs/adr/0004-suscripcion-anual.md',
    'docs/adr/0005-lo-inferido-solo-amplia.md',
    'GOBERNANZA.md',
  ]

  it.each(RENAMED)('fails for a new file named %s', (path) => {
    const problems = checkEnglishOnly([{ path, text: 'English only.' }], noLists)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(`${path} looks named in Spanish`)
  })

  it.each([
    'scripts/check-coherence.mjs',
    'docs/EXECUTION_PLAN.md',
    'docs/ARCHITECTURE.md',
    'docs/BUSINESS_MODEL.md',
    'docs/adr/0001-plan-before-apply.md',
    'docs/adr/0002-local-first-licensing.md',
    'docs/adr/0003-busl-license.md',
    'docs/adr/0004-annual-subscription.md',
    'docs/adr/0005-inference-fails-safe.md',
    'GOVERNANCE.md',
    'packages/cli/test/apply-failed-notice.test.ts',
    'scripts/branch-names-corpus.json',
  ])('accepts the English name %s', (path) => {
    expect(spanishNameEvidence(path)).toEqual([])
  })

  it('reads a Spanish word in a directory name', () => {
    expect(spanishNameEvidence(`src/${WORD}/index.ts`)).toEqual([WORD])
  })

  it('splits camelCase names into words', () => {
    expect(spanishNameEvidence(`src/${WORD}Helper.ts`)).toEqual([WORD])
  })

  it('detects an accent in a name', () => {
    expect(spanishNameEvidence('docs/gu\u00eda.md')).toEqual(['\u00ed'])
  })

  it('fails for a Spanish name even when the file is listed for its content', () => {
    const files = [{ path: 'GOBERNANZA.md', text: SPANISH_LINE }]
    const problems = checkEnglishOnly(files, { pending: ['GOBERNANZA.md'], exceptions: [] })
    expect(problems).toEqual([expect.stringContaining('GOBERNANZA.md looks named in Spanish')])
  })
})
