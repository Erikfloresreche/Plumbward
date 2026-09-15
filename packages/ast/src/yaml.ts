import { isSeq, parseDocument, stringify } from 'yaml'
import { isPlainObject, parsePointer } from './pointer.js'
import type { PatchResult } from './json.js'

/**
 * Idempotent patching of YAML files, preserving comments, anchors and order.
 *
 * The work is done on the `Document` of the `yaml` library (not on the plain JS
 * object) because `parse` + `stringify` would destroy every comment, and the
 * generated YAML carries explanatory comments in the language of the profile.
 */

export type YamlPatchStrategy = 'set' | 'merge' | 'appendUnique'

export interface YamlPatch {
  readonly pointer: string
  readonly value: unknown
  readonly strategy: YamlPatchStrategy
}

type YamlDocument = ReturnType<typeof parseDocument>

/**
 * Non-destructive merge on the document: walks the source object and only
 * writes the paths that do not exist yet in the client's YAML.
 */
function mergeIntoDocument(
  doc: YamlDocument,
  basePath: readonly string[],
  source: Record<string, unknown>,
): boolean {
  let changed = false

  for (const [key, value] of Object.entries(source)) {
    const path = [...basePath, key]
    const existing = doc.getIn(path)

    if (existing === undefined || existing === null) {
      doc.setIn(path, value)
      changed = true
      continue
    }

    if (isPlainObject(value)) {
      if (mergeIntoDocument(doc, path, value)) changed = true
    }
    // Scalars and sequences already present: they are respected.
  }

  return changed
}

function appendUniqueIntoDocument(
  doc: YamlDocument,
  path: readonly string[],
  incoming: readonly unknown[],
): boolean {
  const existing = doc.getIn(path)

  if (existing === undefined || existing === null) {
    doc.setIn(path, [...incoming])
    return incoming.length > 0
  }

  if (!isSeq(existing)) {
    throw new Error(`Cannot append to "${path.join('.')}": the node is not a list.`)
  }

  const present = new Set(
    existing.items.map((item) => JSON.stringify(doc.createNode(item).toJSON())),
  )
  let changed = false

  for (const item of incoming) {
    const key = JSON.stringify(item)
    if (present.has(key)) continue
    present.add(key)
    existing.add(doc.createNode(item))
    changed = true
  }

  return changed
}

/**
 * Applies a list of patches to a YAML document.
 *
 * As with JSON, applying the same batch twice returns `changed: false`.
 */
export function patchYaml(
  text: string,
  patches: readonly YamlPatch[],
  filePath = '(yaml)',
): PatchResult {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) {
    const first = doc.errors[0]
    throw new Error(`Could not parse "${filePath}" as YAML: ${first?.message ?? 'error'}`)
  }

  let changed = false

  for (const patch of patches) {
    const path = parsePointer(patch.pointer)
    if (path.length === 0) {
      throw new Error(`The root pointer cannot be patched in "${filePath}".`)
    }

    switch (patch.strategy) {
      case 'set': {
        const existing = doc.getIn(path)
        if (existing === undefined || existing === null) {
          doc.setIn(path, patch.value)
          changed = true
        }
        break
      }
      case 'merge': {
        if (!isPlainObject(patch.value)) {
          throw new Error(`The "merge" strategy requires an object at "${patch.pointer}".`)
        }
        if (mergeIntoDocument(doc, path, patch.value)) changed = true
        break
      }
      case 'appendUnique': {
        const incoming = Array.isArray(patch.value) ? patch.value : [patch.value]
        if (appendUniqueIntoDocument(doc, path, incoming)) changed = true
        break
      }
    }
  }

  if (!changed) return { text, changed: false }

  const next = doc.toString({ lineWidth: 0 })
  return { text: next, changed: next !== text }
}

/** Parses a whole YAML document into plain JavaScript values. */
export function parseYamlToJson(text: string): unknown {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) {
    const first = doc.errors[0]
    throw new Error(`Invalid YAML: ${first?.message ?? 'error'}`)
  }
  return doc.toJSON()
}

/** Serialises a value to YAML without wrapping lines. */
export function stringifyYaml(value: unknown): string {
  return stringify(value, { lineWidth: 0 })
}

/** Reads a value by pointer from a YAML document. Returns `undefined` if it does not exist. */
export function getYamlValue(text: string, pointer: string): unknown {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) return undefined
  const path = parsePointer(pointer)
  if (path.length === 0) return doc.toJSON()
  const node = doc.getIn(path)
  return node === undefined ? undefined : JSON.parse(JSON.stringify(doc.createNode(node).toJSON()))
}
