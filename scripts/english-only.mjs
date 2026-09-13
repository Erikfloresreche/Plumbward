/**
 * Control that keeps new Spanish out of the repository.
 *
 * English is the language of the whole repository since 2026-09-13 (F0-41):
 * instructions, plan, docs, comments, tests. A written rule decays; this
 * control does not. Every tracked file is scanned, and a file with Spanish
 * must be in one of two lists in `scripts/english-only.json`:
 *
 * - `pending`: files still to be translated. Each task of the English block
 *   (F0-16, F0-18, F0-42 to F0-45) removes its own. A pending file that no
 *   longer has Spanish fails too, so the list cannot go stale.
 * - `exceptions`: files that must stay in Spanish, each with its reason. The
 *   same staleness rule applies.
 *
 * An exception may declare `fragments` (F0-48): the exact Spanish literals the
 * file keeps on purpose, like a closed branch name quoted in the plan. The file
 * is scanned with those literals removed, so any other Spanish still fails.
 * Without `fragments`, the exception excuses the whole file.
 *
 *     { "path": "docs/EXECUTION_PLAN.md", "reason": "...",
 *       "fragments": ["fix/f0-<spanish-slug>", "Old check name that wraps"] }
 *
 * - A space in a fragment matches any run of whitespace, line breaks included:
 *   a literal the text wraps across two lines, with its indentation, is
 *   declared once, on one line.
 * - Everything else matches literally and with its case.
 * - A fragment fails if it no longer appears in its file, if it has no Spanish,
 *   or if it is shorter than ten characters without its outer whitespace: a
 *   short one would excuse a word everywhere in the file, not one literal.
 *
 * Pure functions, like `branch-names.mjs`: `check-coherence.mjs` only
 * wires them to the files on disk.
 *
 * File and directory names are checked too (F0-16), with no list to escape to:
 * a Spanish name is renamed, not excused. A false positive is fixed in the
 * heuristic, with its test.
 *
 * Not mechanisable: translation fidelity. An English text that says something
 * else than the original passes; the defence is the fresh-context review. Nor
 * a Spanish name made only of words English also has: the name heuristic is a
 * word list and a few suffixes, not a dictionary.
 */

import { SPANISH_WORDS, spanishEvidence } from './branch-names.mjs'

/**
 * Files read at the start of every session. They can never be listed: a
 * Spanish sentence there is read, and copied, by every session.
 */
export const ALWAYS_ENGLISH = Object.freeze(['CLAUDE.md', '.claude/napkin.md', '.github/PULL_REQUEST_TEMPLATE.md'])

/**
 * Characters that only Spanish uses among the languages we write: n with
 * tilde, the inverted question and exclamation marks, and the acute vowels.
 * Written as escapes so this file passes its own control. English loanwords
 * with an accent collide; that is what the exceptions list is for. The u with
 * diaeresis is left out: German names use it more than Spanish text does.
 */
const SPANISH_CHARACTER = /[\u00f1\u00d1\u00bf\u00a1\u00e1\u00e9\u00ed\u00f3\u00fa\u00c1\u00c9\u00cd\u00d3\u00da]/

/**
 * The unambiguous Spanish words of the branch-name control, for text written
 * without accents. Only whole words, so a Spanish word hidden inside a longer
 * English one does not match. `_` counts as a boundary: a Spanish word in a
 * snake_case identifier still matches.
 */
const SPANISH_WORD = new RegExp(`(?<![a-z])(${[...SPANISH_WORDS].join('|')})(?![a-z])`, 'i')

/**
 * @typedef {object} SpanishEvidence
 * @property {number} line 1-based line number
 * @property {string} match the character or word found
 */

/**
 * First sign of Spanish in a text, or `undefined` if there is none.
 *
 * @param {string} text
 * @returns {SpanishEvidence | undefined}
 */
export function findSpanish(text) {
  for (const [i, line] of text.split('\n').entries()) {
    const found = SPANISH_CHARACTER.exec(line) ?? SPANISH_WORD.exec(line)
    if (found) return { line: i + 1, match: found[0] }
  }
  return undefined
}

/**
 * Spanish words of names this repository already had that neither the
 * branch-name words nor the suffixes catch: `ARQUITECTURA.md`, `GOBERNANZA.md`.
 */
const SPANISH_NAME_WORDS = new Set(['arquitectura', 'gobernanza'])

/**
 * Signs that a path is named in Spanish. Empty = none.
 *
 * Each segment is split into words at separators and at camelCase humps and
 * read with the branch-name heuristic: `PLAN_DE_EJECUCION.md` is read like the
 * slug `plan-de-ejecucion-md`.
 *
 * @param {string} path repository-relative path
 * @returns {string[]}
 */
export function spanishNameEvidence(path) {
  const character = SPANISH_CHARACTER.exec(path)
  if (character) return [character[0]]
  return path.split('/').flatMap((segment) => {
    const words = segment
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
    return [...spanishEvidence(words.join('-')), ...words.filter((word) => SPANISH_NAME_WORDS.has(word))]
  })
}

/**
 * @typedef {object} TrackedFile
 * @property {string} path repository-relative path
 * @property {string} text file contents
 */

/**
 * @typedef {object} LanguageLists
 * @property {string[]} pending
 * @property {{ path: string, reason: string, fragments?: string[] }[]} exceptions
 */

const isStringArray = (value) => Array.isArray(value) && value.every((v) => typeof v === 'string')

/** Shortest fragment accepted, without its outer whitespace. */
export const MIN_FRAGMENT_LENGTH = 10

/**
 * Pattern of a fragment in its file: literal, except that a space matches any
 * run of whitespace, so a literal wrapped across lines still matches.
 *
 * @param {string} fragment
 * @returns {RegExp}
 */
function fragmentPattern(fragment) {
  const literal = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(literal.replace(/ /g, '\\s+'), 'g')
}

/**
 * Problems of the fragments of one file, and its text with them blanked out.
 * Every character of a match but the line breaks becomes a space: line numbers
 * of the Spanish left stay right, and no two words are glued into a new one.
 *
 * @param {string} path
 * @param {string} text
 * @param {string[]} fragments
 * @returns {{ problems: string[], rest: string }}
 */
function removeFragments(path, text, fragments) {
  /** @type {string[]} */
  const problems = []
  let rest = text
  for (const fragment of fragments) {
    if (fragment.trim().length < MIN_FRAGMENT_LENGTH) {
      problems.push(
        `${path}: fragment "${fragment}" is shorter than ${MIN_FRAGMENT_LENGTH} characters; ` +
          'it would excuse a word everywhere in the file, not one literal',
      )
    }
    if (!findSpanish(fragment)) {
      problems.push(`${path}: fragment "${fragment}" has no Spanish: remove it from scripts/english-only.json`)
    }
    const pattern = fragmentPattern(fragment)
    if (!pattern.test(text)) {
      problems.push(`${path}: fragment "${fragment}" no longer appears in the file: remove it from scripts/english-only.json`)
    }
    rest = rest.replace(pattern, (match) => match.replace(/[^\n]/g, ' '))
  }
  return { problems, rest }
}

/**
 * Problems with the language of the tracked files. Empty = all good.
 *
 * @param {TrackedFile[]} files
 * @param {LanguageLists} lists contents of `scripts/english-only.json`
 * @returns {string[]}
 */
export function checkEnglishOnly(files, lists) {
  /** @type {string[]} */
  const problems = []

  // Without files there is no control: fail instead of passing without looking.
  if (files.length === 0) return ['no tracked files to check']

  const exceptions = lists?.exceptions
  if (!isStringArray(lists?.pending) || !Array.isArray(exceptions)) {
    return ['english-only.json must have a "pending" array of paths and an "exceptions" array']
  }

  /** @type {Map<string, string>} path -> list name */
  const listed = new Map()
  /** @type {Map<string, string[]>} path -> fragments of its exception */
  const fragmentsOf = new Map()
  const add = (path, list) => {
    if (listed.has(path)) problems.push(`${path} is listed more than once`)
    else listed.set(path, list)
  }
  for (const path of lists.pending) add(path, 'pending')
  for (const exception of exceptions) {
    const path = exception?.path
    if (typeof path !== 'string') {
      problems.push(`exception without a path: ${JSON.stringify(exception)}`)
      continue
    }
    if (typeof exception.reason !== 'string' || exception.reason.trim() === '') {
      problems.push(`exception ${path} has no reason`)
    }
    if (exception.fragments !== undefined) {
      if (isStringArray(exception.fragments) && exception.fragments.length > 0) {
        fragmentsOf.set(path, exception.fragments)
      } else {
        problems.push(`exception ${path} must declare "fragments" as a non-empty array of strings`)
      }
    }
    add(path, 'exceptions')
  }

  for (const path of ALWAYS_ENGLISH) {
    if (listed.has(path)) problems.push(`${path} is read every session and cannot be in "${listed.get(path)}"`)
  }

  const tracked = new Set(files.map((f) => f.path))
  for (const [path, list] of listed) {
    if (!tracked.has(path)) problems.push(`${path} is in "${list}" but is not a tracked file`)
  }

  for (const { path, text } of files) {
    const nameEvidence = spanishNameEvidence(path)
    if (nameEvidence.length > 0) {
      problems.push(`${path} looks named in Spanish (${nameEvidence.join(', ')}): rename it in English`)
    }
    const fragments = fragmentsOf.get(path)
    if (fragments) {
      const { problems: fragmentProblems, rest } = removeFragments(path, text, fragments)
      problems.push(...fragmentProblems)
      const outside = findSpanish(rest)
      if (outside) {
        problems.push(
          `${path}:${outside.line} contains Spanish ("${outside.match}") outside its declared fragments; ` +
            'translate it, or declare the literal as a fragment in scripts/english-only.json',
        )
      }
      continue
    }
    const evidence = findSpanish(text)
    const list = listed.get(path)
    if (evidence && !list) {
      problems.push(
        `${path}:${evidence.line} contains Spanish ("${evidence.match}"); ` +
          'translate it, or list the file in scripts/english-only.json',
      )
    } else if (!evidence && list) {
      problems.push(`${path} has no Spanish left: remove it from "${list}" in scripts/english-only.json`)
    }
  }

  return problems
}
