import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { isIgnoredPath } from './sloc.js'

/** Tope de seguridad: evita quedarse minutos en un directorio inesperado. */
const MAX_FILES = 200_000

/**
 * Recorrido de disco de respaldo, para cuando el directorio no es un repositorio
 * git y por tanto `git ls-files` no puede darnos la lista.
 */
export async function walkFiles(root: string): Promise<string[]> {
  const results: string[] = []
  const queue: string[] = [root]

  while (queue.length > 0 && results.length < MAX_FILES) {
    const current = queue.pop()
    if (current === undefined) break

    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const absolute = join(current, entry.name)
      const relativePath = relative(root, absolute).split(sep).join('/')
      if (isIgnoredPath(relativePath)) continue

      if (entry.isDirectory()) {
        queue.push(absolute)
      } else if (entry.isFile()) {
        results.push(relativePath)
        if (results.length >= MAX_FILES) break
      }
    }
  }

  return results
}
