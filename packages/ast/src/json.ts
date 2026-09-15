import commentJson from 'comment-json'
import {
  appendUnique,
  isPlainObject,
  mergePreservingExisting,
  parsePointer,
} from './pointer.js'

/**
 * Idempotent patching of JSON files, preserving comments and style.
 *
 * `comment-json` is used instead of `JSON.parse` because very common files in
 * the ecosystem (`tsconfig.json`, `.eslintrc.json`, `devcontainer.json`) carry
 * comments and `JSON.parse` rejects them.
 */

export type JsonPatchStrategy = 'set' | 'merge' | 'appendUnique'

export interface JsonPatch {
  readonly pointer: string
  readonly value: unknown
  readonly strategy: JsonPatchStrategy
}

export interface PatchResult {
  readonly text: string
  readonly changed: boolean
}

/** Detects the dominant indentation of the file, so as not to reformat all of it. */
export function detectIndent(text: string): number | string {
  for (const line of text.split('\n')) {
    const match = /^([ \t]+)\S/.exec(line)
    if (!match?.[1]) continue
    const indent = match[1]
    return indent.startsWith('\t') ? '\t' : indent.length
  }
  return 2
}

/** Detects whether the file ended with a line break, to keep it when writing. */
function endsWithNewline(text: string): boolean {
  return text.endsWith('\n')
}

function parseJson(text: string, filePath: string): unknown {
  try {
    return commentJson.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not parse "${filePath}" as JSON: ${detail}`)
  }
}

/**
 * Walks to the container of the last segment, creating intermediate objects
 * when they are missing. Returns `null` if the path crosses a non-container
 * value.
 */
function resolveParent(
  root: unknown,
  segments: readonly string[],
): { parent: Record<string, unknown> | unknown[]; key: string } | null {
  if (segments.length === 0) return null

  let current: unknown = root
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index)) return null
      current = current[index]
      continue
    }
    if (!isPlainObject(current)) return null
    if (current[segment] === undefined) current[segment] = {}
    current = current[segment]
  }

  const key = segments[segments.length - 1]
  if (key === undefined) return null
  if (!isPlainObject(current) && !Array.isArray(current)) return null
  return { parent: current, key }
}

function readSlot(parent: Record<string, unknown> | unknown[], key: string): unknown {
  return Array.isArray(parent) ? parent[Number(key)] : parent[key]
}

function writeSlot(
  parent: Record<string, unknown> | unknown[],
  key: string,
  value: unknown,
): void {
  if (Array.isArray(parent)) parent[Number(key)] = value
  else parent[key] = value
}

/**
 * Applies a list of patches to a JSON document.
 *
 * Key property: applying the same batch twice returns `changed: false` on the
 * second pass and a text identical byte for byte.
 */
export function patchJson(
  text: string,
  patches: readonly JsonPatch[],
  filePath = '(json)',
): PatchResult {
  const root = parseJson(text, filePath)
  let changed = false

  for (const patch of patches) {
    const segments = parsePointer(patch.pointer)
    if (segments.length === 0) {
      throw new Error(`The root pointer cannot be patched in "${filePath}".`)
    }

    const resolved = resolveParent(root, segments)
    if (!resolved) {
      throw new Error(
        `The path "${patch.pointer}" of "${filePath}" crosses a value that is neither an object nor an array.`,
      )
    }

    const { parent, key } = resolved
    const existing = readSlot(parent, key)

    switch (patch.strategy) {
      case 'set': {
        // Non-destructive: if there is already a value, it is respected.
        if (existing === undefined) {
          writeSlot(parent, key, patch.value)
          changed = true
        }
        break
      }
      case 'merge': {
        if (!isPlainObject(patch.value)) {
          throw new Error(`The "merge" strategy requires an object at "${patch.pointer}".`)
        }
        if (existing === undefined) {
          writeSlot(parent, key, patch.value)
          changed = true
        } else if (isPlainObject(existing)) {
          if (mergePreservingExisting(existing, patch.value)) changed = true
        } else {
          throw new Error(
            `Cannot merge onto a value that is not an object at "${patch.pointer}" of "${filePath}".`,
          )
        }
        break
      }
      case 'appendUnique': {
        const incoming = Array.isArray(patch.value) ? patch.value : [patch.value]
        if (existing === undefined) {
          writeSlot(parent, key, [...incoming])
          changed = true
        } else if (Array.isArray(existing)) {
          if (appendUnique(existing, incoming)) changed = true
        } else {
          throw new Error(
            `Cannot append to a value that is not an array at "${patch.pointer}" of "${filePath}".`,
          )
        }
        break
      }
    }
  }

  if (!changed) return { text, changed: false }

  const serialised = commentJson.stringify(root, null, detectIndent(text))
  const next = endsWithNewline(text) ? `${serialised}\n` : serialised
  return { text: next, changed: next !== text }
}

/** Reads a value by pointer. Returns `undefined` if the path does not exist. */
export function getJsonValue(text: string, pointer: string, filePath = '(json)'): unknown {
  const root = parseJson(text, filePath)
  let current: unknown = root
  for (const segment of parsePointer(pointer)) {
    if (Array.isArray(current)) {
      current = current[Number(segment)]
    } else if (isPlainObject(current)) {
      current = current[segment]
    } else {
      return undefined
    }
    if (current === undefined) return undefined
  }
  return current
}
