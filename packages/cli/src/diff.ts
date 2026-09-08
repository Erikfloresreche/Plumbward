/**
 * Diff por líneas mínimo, sin dependencias.
 *
 * Los ficheros que genera la herramienta son configuraciones de unos cientos de
 * líneas, así que una LCS cuadrática con tope de seguridad es más que suficiente
 * y evita arrastrar una librería sólo para pintar el plan.
 */

export type DiffKind = 'context' | 'added' | 'removed'

export interface DiffLine {
  readonly kind: DiffKind
  readonly text: string
}

/** Por encima de este tamaño no se calcula LCS: se muestra un resumen. */
const MAX_LINES_FOR_LCS = 2_000

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')

  if (a.length > MAX_LINES_FOR_LCS || b.length > MAX_LINES_FOR_LCS) {
    return [
      { kind: 'removed', text: `... ${a.length} líneas anteriores` },
      { kind: 'added', text: `... ${b.length} líneas nuevas` },
    ]
  }

  // Matriz de longitudes de la subsecuencia común más larga.
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const row = lengths[i]
      const nextRow = lengths[i + 1]
      if (!row || !nextRow) continue
      row[j] = a[i] === b[j] ? (nextRow[j + 1] ?? 0) + 1 : Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0)
    }
  }

  const result: DiffLine[] = []
  let i = 0
  let j = 0

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ kind: 'context', text: a[i] ?? '' })
      i += 1
      j += 1
      continue
    }
    const down = lengths[i + 1]?.[j] ?? 0
    const right = lengths[i]?.[j + 1] ?? 0
    if (down >= right) {
      result.push({ kind: 'removed', text: a[i] ?? '' })
      i += 1
    } else {
      result.push({ kind: 'added', text: b[j] ?? '' })
      j += 1
    }
  }

  while (i < a.length) {
    result.push({ kind: 'removed', text: a[i] ?? '' })
    i += 1
  }
  while (j < b.length) {
    result.push({ kind: 'added', text: b[j] ?? '' })
    j += 1
  }

  return result
}

/**
 * Reduce el diff a los trozos con cambios más unas líneas de contexto,
 * como hace `git diff`. Sin esto, un fichero de 300 líneas con un cambio
 * llenaría la pantalla de ruido.
 */
export function collapseContext(lines: readonly DiffLine[], context = 2): DiffLine[] {
  const keep = new Set<number>()

  lines.forEach((line, index) => {
    if (line.kind === 'context') return
    for (let offset = -context; offset <= context; offset += 1) {
      const target = index + offset
      if (target >= 0 && target < lines.length) keep.add(target)
    }
  })

  const result: DiffLine[] = []
  let skipping = false

  lines.forEach((line, index) => {
    if (keep.has(index)) {
      result.push(line)
      skipping = false
    } else if (!skipping) {
      result.push({ kind: 'context', text: '  ...' })
      skipping = true
    }
  })

  return result
}
