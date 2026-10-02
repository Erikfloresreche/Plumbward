/**
 * Applies one mutation of `check-mutations.mjs` to the text of a file.
 *
 * It exists because the optional `extra` replacement was applied with a bare
 * `String.replace`, with no count: when its anchor stopped occurring, the
 * replacement became a silent no-op. F0-45 changed
 * `ciProdWorkflow(manager, release)` to take the language, and the `extra` of
 * `'Deploy with no configured branch'` stopped doing anything with nothing
 * saying so. Both anchors now go through the same check: exactly one
 * occurrence, or `STALE ANCHOR`.
 *
 * It lives outside `check-mutations.mjs` so it can be tested: that script runs
 * on load and ends in `process.exit`. Task F0-50.
 */

/**
 * @typedef {{ mutated: string } | { stale: { anchor: string, count: number } }} Applied
 */

const occurrences = (text, anchor) => text.split(anchor).length - 1

/**
 * Replaces `from` with `to` and then, if given, `extra[0]` with `extra[1]`.
 *
 * Each anchor must occur exactly once in the text it is applied to: the
 * primary one in the original, the `extra` one in the text after the primary
 * replacement. Zero means the code moved and the mutation tests nothing; two
 * means it may mutate the wrong place.
 *
 * @param {string} original content of the file
 * @param {string} from primary anchor
 * @param {string} to primary replacement
 * @param {[string, string] | undefined} extra optional second replacement
 * @returns {Applied} the mutated text, or the first anchor that does not
 *   occur exactly once
 */
export function applyMutation(original, from, to, extra) {
  const count = occurrences(original, from)
  if (count !== 1) return { stale: { anchor: from, count } }
  const mutated = original.replace(from, () => to)
  if (!extra) return { mutated }
  const extraCount = occurrences(mutated, extra[0])
  if (extraCount !== 1) return { stale: { anchor: extra[0], count: extraCount } }
  return { mutated: mutated.replace(extra[0], () => extra[1]) }
}
