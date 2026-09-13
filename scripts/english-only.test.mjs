import { describe, expect, it } from 'vitest'

import { SPANISH_WORDS } from './branch-names.mjs'
import { ALWAYS_ENGLISH, checkEnglishOnly, findSpanish } from './english-only.mjs'

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
