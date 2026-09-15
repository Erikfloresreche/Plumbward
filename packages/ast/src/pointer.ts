/** RFC-6901 pointer utilities shared by the JSON and YAML parsers. */

/**
 * Turns an RFC-6901 pointer (`/scripts/lint`) into its segments, undoing the
 * `~1` (slash) and `~0` (tilde) escapes.
 */
export function parsePointer(pointer: string): string[] {
  if (pointer === '' || pointer === '/') return []
  if (!pointer.startsWith('/')) {
    throw new Error(`Invalid pointer "${pointer}": it must start with "/".`)
  }
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'))
}

/** Whether a value is a plain object (not an array, not null). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * NON-destructive, IN-PLACE merge: values that already exist in the target are
 * kept; only the missing keys are added.
 *
 * The object is mutated instead of creating a new one because `comment-json`
 * stores the comments in symbols of the object itself: a spread would lose
 * them.
 *
 * @returns `true` if anything actually changed (the basis of idempotency).
 */
export function mergePreservingExisting(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): boolean {
  let changed = false

  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = target[key]
    if (targetValue === undefined) {
      target[key] = sourceValue
      changed = true
      continue
    }
    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      if (mergePreservingExisting(targetValue, sourceValue)) changed = true
    }
    // Scalar value already present: the client team's decision is respected.
  }

  return changed
}

/**
 * Appends IN PLACE to an array the elements not yet present (structural
 * comparison through JSON).
 *
 * @returns `true` if anything was added.
 */
export function appendUnique(target: unknown[], incoming: readonly unknown[]): boolean {
  const seen = new Set(target.map((item) => JSON.stringify(item)))
  let changed = false

  for (const item of incoming) {
    const key = JSON.stringify(item)
    if (!seen.has(key)) {
      seen.add(key)
      target.push(item)
      changed = true
    }
  }

  return changed
}
