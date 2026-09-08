import { isSeq, parseDocument, stringify } from 'yaml'
import { isPlainObject, parsePointer } from './pointer.js'
import type { PatchResult } from './json.js'

/**
 * Parcheo idempotente de ficheros YAML preservando comentarios, anclas y orden.
 *
 * Se trabaja sobre el `Document` de la librería `yaml` (no sobre el objeto JS
 * plano) porque `parse` + `stringify` destruiría todos los comentarios, y la
 * especificación exige comentarios instructivos en español en los YAML generados.
 */

export type YamlPatchStrategy = 'set' | 'merge' | 'appendUnique'

export interface YamlPatch {
  readonly pointer: string
  readonly value: unknown
  readonly strategy: YamlPatchStrategy
}

type YamlDocument = ReturnType<typeof parseDocument>

/**
 * Fusión no destructiva sobre el documento: recorre el objeto fuente y sólo
 * escribe las rutas que aún no existen en el YAML del cliente.
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
    // Escalares y secuencias ya presentes: se respetan.
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
    throw new Error(`No se puede añadir a "${path.join('.')}": el nodo no es una lista.`)
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
 * Aplica una lista de parches a un documento YAML.
 *
 * Igual que en JSON, aplicar el mismo lote dos veces devuelve `changed: false`.
 */
export function patchYaml(
  text: string,
  patches: readonly YamlPatch[],
  filePath = '(yaml)',
): PatchResult {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) {
    const first = doc.errors[0]
    throw new Error(`No se pudo parsear "${filePath}" como YAML: ${first?.message ?? 'error'}`)
  }

  let changed = false

  for (const patch of patches) {
    const path = parsePointer(patch.pointer)
    if (path.length === 0) {
      throw new Error(`El puntero raíz no es parcheable en "${filePath}".`)
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
          throw new Error(`La estrategia "merge" exige un objeto en "${patch.pointer}".`)
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

/** Parsea un YAML completo a valores JavaScript planos. */
export function parseYamlToJson(text: string): unknown {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) {
    const first = doc.errors[0]
    throw new Error(`YAML inválido: ${first?.message ?? 'error'}`)
  }
  return doc.toJSON()
}

/** Serializa un valor a YAML con líneas sin recortar. */
export function stringifyYaml(value: unknown): string {
  return stringify(value, { lineWidth: 0 })
}

/** Lee un valor por puntero de un YAML. Devuelve `undefined` si no existe. */
export function getYamlValue(text: string, pointer: string): unknown {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) return undefined
  const path = parsePointer(pointer)
  if (path.length === 0) return doc.toJSON()
  const node = doc.getIn(path)
  return node === undefined ? undefined : JSON.parse(JSON.stringify(doc.createNode(node).toJSON()))
}
