/**
 * Control del filtro `paths:` del workflow de mutaciones.
 *
 * `mutations.yml` no corre en todas las PRs: sólo en las que tocan los
 * ficheros que `check-mutations.mjs` muta o ejecuta. Ese filtro es una lista
 * escrita a mano, y la lista de mutaciones crece: en cuanto una mutación nueva
 * toque un fichero que el filtro no nombra, el job deja de ejecutarse en las
 * PRs que lo cambian y nadie se entera, porque un workflow que no dispara no
 * sale en rojo — ni sale.
 *
 * Es la misma clase de fallo que el `if: matrix.node == '22'` del napkin: una
 * condición que se desajusta en silencio. Aquí se deriva la lista del propio
 * script en lugar de confiar en que alguien actualice las dos.
 *
 * Vive fuera de `verificar-coherencia.mjs` por la misma razón que
 * `branch-names.mjs`: aquel script se ejecuta al cargarse y termina en
 * `process.exit`, así que no se puede probar. Aquí sólo hay funciones puras.
 *
 * Tarea F0-27.
 */

/**
 * Ficheros que `check-mutations.mjs` muta o ejecuta como test.
 *
 * Tres fuentes, porque el script usa las tres: las constantes de fichero
 * (`const BR = '...'`), el array `TESTS`, y cualquier ruta escrita como
 * literal en la posición de fichero de una mutación.
 *
 * @param {string} scriptText contenido de `scripts/check-mutations.mjs`
 * @returns {string[]} rutas relativas a la raíz, ordenadas y sin repetir
 */
export function mutationInputs(scriptText) {
  const files = new Set()

  for (const m of scriptText.matchAll(/^const [A-Z]+ = '([^']+)'$/gm)) files.add(m[1])

  const tests = /const TESTS = \[([\s\S]*?)\]/.exec(scriptText)
  if (tests) for (const m of tests[1].matchAll(/'([^']+)'/g)) files.add(m[1])

  // Posición de fichero de una mutación escrita como literal en vez de como
  // constante: `['descripción', 'ruta/al/fichero.ts', ...]`.
  for (const m of scriptText.matchAll(/^\s*\['(?:[^'\\]|\\.)*',\s*'([^']+)'/gm)) files.add(m[1])

  return [...files].sort()
}

/**
 * Rutas declaradas en el filtro `paths:` de un workflow.
 *
 * @param {string} workflowText contenido del fichero de workflow
 * @returns {string[]} rutas tal y como están escritas, sin comillas
 */
export function workflowPaths(workflowText) {
  const lines = workflowText.split('\n')
  const start = lines.findIndex((line) => /^\s+paths:\s*$/.test(line))
  if (start === -1) return []

  const indent = /^(\s*)/.exec(lines[start])[1].length
  const paths = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue

    // Una línea que no está más indentada que `paths:` ya es otra clave.
    const sangria = /^(\s*)/.exec(line)[1].length
    if (sangria <= indent) break

    // Los comentarios no interrumpen la lista: el filtro lleva uno en medio
    // para separar los ficheros mutados de los que gobiernan la ejecución.
    const contenido = line.trim()
    if (contenido.startsWith('#')) continue

    const entrada = /^-\s*'?([^']+?)'?\s*$/.exec(contenido)
    if (!entrada) break
    paths.push(entrada[1])
  }
  return paths
}

/**
 * Ficheros que el script muta o ejecuta y que el filtro del workflow no nombra.
 *
 * Se exige la ruta exacta, no un patrón que la cubra: un `packages/**` haría
 * pasar el control y devolvería el job a ejecutarse en PRs que no lo necesitan,
 * que es justo lo que el filtro evita.
 *
 * @param {string} scriptText contenido de `scripts/check-mutations.mjs`
 * @param {string} workflowText contenido de `.github/workflows/mutations.yml`
 * @returns {string[]} rutas sin cubrir, ordenadas
 */
export function uncoveredMutationInputs(scriptText, workflowText) {
  const declared = new Set(workflowPaths(workflowText))
  return mutationInputs(scriptText).filter((file) => !declared.has(file))
}
