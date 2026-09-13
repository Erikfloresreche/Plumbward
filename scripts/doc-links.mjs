/**
 * Control that keeps the relative links of the documentation pointing at
 * files that exist.
 *
 * F0-16 renamed the plan, the architecture, the business model and the ADRs.
 * A rename breaks every link to the old path, and a broken link fails nothing:
 * the reader just lands on a 404. This control fails instead.
 *
 * Pure functions, like `branch-names.mjs`: `check-coherence.mjs` only wires
 * them to the files on disk.
 *
 * Scope: inline Markdown links and images, `[text](target)`, outside code.
 * External URLs are skipped, and so is the anchor of a link: whether a heading
 * still exists is not checked.
 */

import { posix } from 'node:path'

/** `[text](target)` or `![alt](target "title")`; the target may be in `<>`. */
const LINK = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g

/** A URL scheme: `https:`, `mailto:`. */
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i

/**
 * @typedef {object} LinkTarget
 * @property {number} line 1-based line number
 * @property {string} target the target as written
 */

/**
 * Link targets of a Markdown text, skipping fenced code blocks and inline code:
 * an example of a link is not a link.
 *
 * @param {string} text
 * @returns {LinkTarget[]}
 */
export function linkTargets(text) {
  /** @type {LinkTarget[]} */
  const targets = []
  let fence
  for (const [i, line] of text.split('\n').entries()) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)
    if (marker) {
      if (!fence) fence = marker[1][0]
      else if (marker[1][0] === fence) fence = undefined
      continue
    }
    if (fence) continue
    for (const m of line.replace(/`[^`]*`/g, '').matchAll(LINK)) {
      targets.push({ line: i + 1, target: m[1] })
    }
  }
  return targets
}

/**
 * The paths plus every directory that contains one, so a link to a folder
 * resolves too.
 *
 * @param {Iterable<string>} paths repository-relative file paths
 * @returns {Set<string>}
 */
export function withDirectories(paths) {
  const all = new Set(['.'])
  for (const path of paths) {
    all.add(path)
    for (let dir = posix.dirname(path); dir !== '.'; dir = posix.dirname(dir)) all.add(dir)
  }
  return all
}

/**
 * Broken relative links in the Markdown files. Empty = all good.
 *
 * @param {{ path: string, text: string }[]} files repository files; only `.md` are read
 * @param {Set<string>} existing paths that exist, with their directories
 * @returns {string[]}
 */
export function checkDocLinks(files, existing) {
  /** @type {string[]} */
  const problems = []
  for (const { path, text } of files) {
    if (!path.endsWith('.md')) continue
    for (const { line, target } of linkTargets(text)) {
      if (EXTERNAL.test(target) || target.startsWith('#')) continue
      let bare = target.split('#')[0].split('?')[0]
      try {
        bare = decodeURIComponent(bare)
      } catch {
        // A malformed escape is checked as written.
      }
      // A leading `/` is the repository root, as GitHub renders it.
      const resolved = bare.startsWith('/')
        ? posix.normalize(bare.slice(1) || '.')
        : posix.normalize(posix.join(posix.dirname(path), bare))
      const clean = resolved.length > 1 ? resolved.replace(/\/$/, '') : resolved
      if (clean === '..' || clean.startsWith('../')) {
        problems.push(`${path}:${line} links to "${target}", outside the repository`)
      } else if (!existing.has(clean)) {
        problems.push(`${path}:${line} links to "${target}", which does not exist`)
      }
    }
  }
  return problems
}
