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
 * Vive fuera de `check-coherence.mjs` por la misma razón que
 * `branch-names.mjs`: aquel script se ejecuta al cargarse y termina en
 * `process.exit`, así que no se puede probar. Aquí sólo hay funciones puras.
 *
 * Tarea F0-27.
 */

/**
 * ¿Este literal es una ruta de fichero y no un valor cualquiera?
 *
 * El nombre de la constante no sirve para distinguirlo: se reconoce cualquier
 * identificador, porque limitarlo a mayúsculas puras dejaba fuera el `CX2` que
 * escribe quien añade la segunda mutación sobre un fichero ya usado —las
 * abreviaturas de dos letras están agotadas— y el fichero desaparecía de la
 * lista sin que nada fallara.
 *
 * Tampoco se filtra por extensión conocida: eso reabriría el mismo agujero en
 * cuanto se mute un `.yml` o un `.json`. Basta con que tenga forma de ruta
 * —una barra, o una extensión cualquiera—, que es lo que separa
 * `packages/a/b.ts` de `pnpm`. Un falso positivo aquí falla en voz alta; un
 * falso negativo no falla nunca, y por eso el corte se pone de este lado.
 *
 * @param {string} valor literal de la constante
 * @returns {boolean}
 */
const looksLikePath = (value) => value.includes('/') || /\.[A-Za-z0-9]+$/.test(value)

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

  for (const m of scriptText.matchAll(/^const [A-Za-z_$][\w$]* = '([^']+)'$/gm)) {
    if (looksLikePath(m[1])) files.add(m[1])
  }

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
  const indentOf = (line) => /^(\s*)/.exec(line)[1].length

  // El filtro que importa es el de `pull_request`, no el primer `paths:` del
  // fichero: un disparador `push:` con su propia lista por delante secuestraba
  // el control, que validaba esa lista y nunca miraba la que filtra las PRs.
  const pr = lines.findIndex((line) => /^\s+pull_request:\s*$/.test(line))
  if (pr === -1) return []

  let start = -1
  for (let i = pr + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue
    if (indentOf(lines[i]) <= indentOf(lines[pr])) break
    if (/^\s+paths:\s*$/.test(lines[i])) {
      start = i
      break
    }
  }
  if (start === -1) return []

  const indent = indentOf(lines[start])
  const paths = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue

    // Una línea que no está más indentada que `paths:` ya es otra clave.
    if (indentOf(line) <= indent) break

    // Los comentarios no interrumpen la lista: el filtro lleva uno en medio
    // para separar los ficheros mutados de los que gobiernan la ejecución.
    const content = line.trim()
    if (content.startsWith('#')) continue

    const entry = /^-\s*'?([^']+?)'?\s*$/.exec(content)
    if (!entry) break
    paths.push(entry[1])
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
