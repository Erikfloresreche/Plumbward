import commentJson from 'comment-json'
import {
  appendUnique,
  isPlainObject,
  mergePreservingExisting,
  parsePointer,
} from './pointer.js'

/**
 * Parcheo idempotente de ficheros JSON preservando comentarios y estilo.
 *
 * Se usa `comment-json` en lugar de `JSON.parse` porque ficheros muy habituales
 * en el ecosistema (`tsconfig.json`, `.eslintrc.json`, `devcontainer.json`)
 * llevan comentarios y `JSON.parse` los rechaza.
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

/** Detecta la indentación dominante del fichero para no reformatearlo entero. */
export function detectIndent(text: string): number | string {
  for (const line of text.split('\n')) {
    const match = /^([ \t]+)\S/.exec(line)
    if (!match?.[1]) continue
    const indent = match[1]
    return indent.startsWith('\t') ? '\t' : indent.length
  }
  return 2
}

/** Detecta si el fichero terminaba en salto de línea, para respetarlo al escribir. */
function endsWithNewline(text: string): boolean {
  return text.endsWith('\n')
}

function parseJson(text: string, filePath: string): unknown {
  try {
    return commentJson.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`No se pudo parsear "${filePath}" como JSON: ${detail}`)
  }
}

/**
 * Navega hasta el contenedor del último segmento, creando objetos intermedios
 * cuando falten. Devuelve `null` si la ruta atraviesa un valor no contenedor.
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
 * Aplica una lista de parches a un documento JSON.
 *
 * Propiedad clave: aplicar el mismo lote dos veces devuelve `changed: false` en
 * la segunda pasada y un texto idéntico byte a byte.
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
      throw new Error(`El puntero raíz no es parcheable en "${filePath}".`)
    }

    const resolved = resolveParent(root, segments)
    if (!resolved) {
      throw new Error(
        `La ruta "${patch.pointer}" de "${filePath}" atraviesa un valor que no es objeto ni array.`,
      )
    }

    const { parent, key } = resolved
    const existing = readSlot(parent, key)

    switch (patch.strategy) {
      case 'set': {
        // No destructivo: si ya hay un valor, se respeta.
        if (existing === undefined) {
          writeSlot(parent, key, patch.value)
          changed = true
        }
        break
      }
      case 'merge': {
        if (!isPlainObject(patch.value)) {
          throw new Error(`La estrategia "merge" exige un objeto en "${patch.pointer}".`)
        }
        if (existing === undefined) {
          writeSlot(parent, key, patch.value)
          changed = true
        } else if (isPlainObject(existing)) {
          if (mergePreservingExisting(existing, patch.value)) changed = true
        } else {
          throw new Error(
            `No se puede fusionar sobre un valor no objeto en "${patch.pointer}" de "${filePath}".`,
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
            `No se puede añadir a un valor que no es array en "${patch.pointer}" de "${filePath}".`,
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

/** Lee un valor por puntero. Devuelve `undefined` si la ruta no existe. */
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
