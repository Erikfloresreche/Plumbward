/** Utilidades de puntero RFC-6901 compartidas por los parsers JSON y YAML. */

/**
 * Convierte un puntero RFC-6901 (`/scripts/lint`) en sus segmentos,
 * deshaciendo los escapes `~1` (barra) y `~0` (virgulilla).
 */
export function parsePointer(pointer: string): string[] {
  if (pointer === '' || pointer === '/') return []
  if (!pointer.startsWith('/')) {
    throw new Error(`Puntero inválido "${pointer}": debe empezar por "/".`)
  }
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'))
}

/** Indica si un valor es un objeto plano (no array, no null). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Fusión NO destructiva y EN SITIO: los valores que ya existen en el destino se
 * conservan; sólo se añaden las claves ausentes.
 *
 * Se muta el objeto en lugar de crear uno nuevo porque `comment-json` guarda los
 * comentarios en símbolos del propio objeto: un spread los perdería.
 *
 * @returns `true` si hubo algún cambio real (base de la idempotencia).
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
    // Valor escalar ya presente: se respeta la decisión del equipo cliente.
  }

  return changed
}

/**
 * Añade EN SITIO a un array los elementos que aún no estén presentes
 * (comparación estructural por JSON).
 *
 * @returns `true` si se añadió algo.
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
