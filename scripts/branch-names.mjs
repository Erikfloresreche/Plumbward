/**
 * Control de nombres de rama: formato, idioma y exenciones.
 *
 * Vive fuera de `check-coherence.mjs` porque aquel script ejecuta todo al
 * cargarse y termina en `process.exit`: no se podía probar. Aquí sólo hay
 * funciones puras, y `scripts/branch-names.test.mjs` las cubre con el corpus
 * de `branch-names-corpus.json`.
 *
 * Tarea F0-15.
 */

/**
 * Formato `<tipo>/f<fase>-<slug>`.
 *
 * La fase es `0` o un número sin ceros a la izquierda, como máximo de dos
 * cifras: antes era `f\d+` y aceptaba `f00` y `f999`, que no son fases.
 */
export const BRANCH_FORMAT =
  /^(feat|fix|refactor|test|docs|build|ci|chore)\/f(0|[1-9][0-9]?)-[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Ramas permanentes del repositorio. No son ramas de tarea y no siguen el
 * formato: una release es una Pull Request de `develop` a `Prod`, y con el
 * control activo en CI esa PR fallaba.
 *
 * Es una lista explícita, no un patrón: un patrón vuelve a ser una puerta
 * trasera, que es justo lo que falló con el prefijo `dependabot/`.
 */
export const PERMANENT_BRANCHES = ['Prod', 'develop']

/**
 * Palabras españolas de contenido frecuentes en nuestros nombres de rama.
 *
 * La lista sale del corpus, no de la intuición: son las palabras que hicieron
 * falta para detectar los nombres que la propia PR #6 renombró y que ninguna
 * terminación reconoce. Todas son inequívocamente españolas — `metricas`, no
 * `metrics`; `guia`, no `guide` — para no rechazar nombres ingleses válidos.
 */
export const SPANISH_WORDS = new Set([
  'rama', 'ramas', 'regla', 'reglas', 'prueba', 'pruebas', 'paquete', 'informe',
  'guia', 'flujo', 'flujos', 'controles', 'propio', 'documentacion', 'unica',
  'unico', 'cobertura', 'umbral', 'trinquete', 'metricas', 'reales',
])

/**
 * Palabras funcionales españolas. Sólo cuentan como señal **entre** otros dos
 * componentes del slug.
 *
 * En español unen dos palabras (`gobierno-de-ramas`, `landing-y-demo`); en
 * inglés aparecen al principio como prefijo o etiqueta (`de-duplicate`,
 * `y-axis`), y ahí no dicen nada. La lista anterior no distinguía la posición
 * y rechazaba los dos nombres ingleses.
 */
const SPANISH_FUNCTION_WORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'con', 'para', 'por', 'al', 'sin',
])

/**
 * Terminaciones que no existen en inglés. Generalizan mucho mejor que una
 * lista de palabras: cubren la mitad de los nombres que la lista dejaba pasar
 * sin enumerar el vocabulario del proyecto.
 *
 * `minLength` descarta las palabras inglesas cortas que acaban igual: `dad`,
 * `aid`, `via`. **No descarta las largas**: `fascia`, `aikido` y `granddad` se
 * marcarían como españolas. Es una colisión aceptada a sabiendas, no un
 * descuido — subir el umbral a 7 perdería `gracia`, que mide lo mismo que
 * `fascia` y sí está en el corpus. Ninguna de esas palabras aparece en un
 * nombre de rama de este repositorio; si algún día aparece, se añade al corpus
 * como negativo y se decide entonces.
 *
 * No se incluye `-ado`/`-ada`: el corpus no lo necesita y el inglés tiene
 * `tornado`, `avocado` y `bravado`.
 */
const SPANISH_SUFFIXES = [
  { suffix: 'cion', minLength: 6 },
  { suffix: 'ciones', minLength: 8 },
  { suffix: 'dad', minLength: 6 },
  { suffix: 'dades', minLength: 8 },
  { suffix: 'miento', minLength: 8 },
  { suffix: 'mientos', minLength: 9 },
  { suffix: 'cia', minLength: 6 },
  { suffix: 'cias', minLength: 7 },
  { suffix: 'ido', minLength: 6 },
  { suffix: 'idos', minLength: 7 },
  { suffix: 'mente', minLength: 7 },
]

/**
 * Devuelve las señales de que un slug está en español. Vacío = ninguna.
 *
 * @param {string} slug el nombre sin `<tipo>/f<fase>-`
 * @returns {string[]}
 */
export function spanishEvidence(slug) {
  const parts = slug.split('-')
  /** @type {string[]} */
  const evidence = []
  for (const [i, part] of parts.entries()) {
    if (SPANISH_WORDS.has(part)) {
      evidence.push(part)
      continue
    }
    const isMedial = i > 0 && i < parts.length - 1
    if (isMedial && SPANISH_FUNCTION_WORDS.has(part)) {
      evidence.push(part)
      continue
    }
    const suffix = SPANISH_SUFFIXES.find(
      (s) => part.length >= s.minLength && part.endsWith(s.suffix),
    )
    if (suffix) evidence.push(part)
  }
  return evidence
}

/**
 * @param {string} branch
 * @returns {string | undefined} el motivo por el que el nombre no vale
 */
export function branchProblem(branch) {
  if (/[^\x00-\x7F]/.test(branch)) return 'contiene caracteres no ASCII'
  if (!BRANCH_FORMAT.test(branch)) return 'no sigue el formato <tipo>/f<fase>-<slug>'
  const slug = branch.split('/')[1].replace(/^f\d+-/, '')
  const evidence = spanishEvidence(slug)
  if (evidence.length > 0) return `parece estar en español (${evidence.join(', ')})`
  return undefined
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Motivo por el que una rama queda exenta del formato, si lo hay.
 *
 * La exención es por **autor** siempre que se puede, no por nombre: el prefijo
 * `dependabot/` era una puerta trasera porque cualquiera podía llamar así a su
 * rama (`dependabot/../fix/f0-ramas` lo superaba). El autor lo pone GitHub.
 *
 * @param {string} branch
 * @param {string | undefined} actor el `github.actor` que abre la Pull Request
 * @returns {string | undefined}
 */
export function branchExemption(branch, actor) {
  if (PERMANENT_BRANCHES.includes(branch)) return 'rama permanente del repositorio'

  // Cualquier bot: dependabot, renovate, github-actions. El sufijo `[bot]` lo
  // añade GitHub al login y no se puede falsificar desde el nombre de rama.
  if (actor && actor.endsWith('[bot]')) return `rama creada por el bot ${actor}`

  // `<login>-patch-<n>`: editor web de GitHub, que usarán los colaboradores
  // externos al ser el repositorio público. Se acepta sólo si el login del
  // nombre es el del autor, de modo que la exención sigue siendo por autor.
  if (actor && new RegExp(`^${escapeRegExp(actor)}-patch-\\d+$`).test(branch)) {
    return 'rama del editor web de GitHub'
  }

  // `revert-<pr>-<rama>`: botón Revert de GitHub. El nombre lo compone GitHub
  // a partir de una rama que ya pasó el control, así que se exige que la rama
  // revertida sea válida: `revert-1-lo-que-sea` no pasa.
  const reverted = /^revert-\d+-(.+)$/.exec(branch)?.[1]
  if (reverted && (PERMANENT_BRANCHES.includes(reverted) || !branchProblem(reverted))) {
    return 'rama del botón Revert de GitHub'
  }

  return undefined
}

/**
 * @param {string | undefined} branch la rama de la PR en curso
 * @param {string | undefined} actor
 * @returns {string | undefined} el motivo del fallo, si lo hay
 */
export function checkPullRequestBranch(branch, actor) {
  if (!branch) return undefined
  if (branchExemption(branch, actor)) return undefined
  return branchProblem(branch)
}

/**
 * Extrae las tareas y sus ramas del plan de ejecución.
 *
 * Reconoce `### [ ]`, `### [x]` y `### [X]`. Cualquier otra cabecera cierra la
 * tarea anterior: antes el estado `pendiente` sobrevivía a las cabeceras que no
 * son tareas y atribuía ramas a la tarea equivocada.
 *
 * `declarations` cuenta todas las líneas `**Branch:**`; `branches`, sólo las que
 * nombran una rama entre acentos graves. No son lo mismo: dos tareas del plan
 * declaran a propósito que no tienen rama de código ("GitHub configuration",
 * "separate repository").
 *
 * `tasksWithoutDeclaration` se cuenta **por tarea**, no comparando totales: una
 * línea `**Branch:**` que cuelgue de una cabecera que no es tarea compensaría a la
 * que falta, y la tarea sin rama volvería a pasar sin que nadie la juzgue. Es el
 * mismo fallo silencioso que la aserción venía a cerrar.
 *
 * @param {string} text
 * @returns {{ tasks: number, declarations: number, tasksWithoutDeclaration: number, branches: { name: string, pending: boolean }[] }}
 */
export function parsePlan(text) {
  let pending = false
  let inTask = false
  let taskHasDeclaration = false
  let tasks = 0
  let declarations = 0
  let tasksWithoutDeclaration = 0
  /** @type {{ name: string, pending: boolean }[]} */
  const branches = []

  const closeTask = () => {
    if (inTask && !taskHasDeclaration) tasksWithoutDeclaration += 1
    inTask = false
    taskHasDeclaration = false
  }

  for (const line of text.split('\n')) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      closeTask()
      const task = heading[1].length === 3 && /^\[([ xX])\]\s+\S/.exec(heading[2])
      if (task) {
        tasks += 1
        pending = task[1] === ' '
        inTask = true
      } else {
        pending = false
      }
      continue
    }
    if (!/^\s*\*\*Branch:\*\*/.test(line)) continue
    declarations += 1
    if (inTask) taskHasDeclaration = true
    const branch = /^\s*\*\*Branch:\*\*\s*`([^`]+)`/.exec(line)
    if (branch) branches.push({ name: branch[1], pending })
  }
  closeTask()

  return { tasks, declarations, tasksWithoutDeclaration, branches }
}

/**
 * Comprueba las ramas previstas para las tareas PENDIENTES del plan. Las
 * cerradas se saltan a propósito: su nombre es un hecho histórico, no una
 * convención.
 *
 * @param {string} text
 * @returns {string[]} los fallos encontrados
 */
export function checkPlan(text) {
  /** @type {string[]} */
  const failures = []
  const { tasks, tasksWithoutDeclaration, branches } = parsePlan(text)

  // Aserción de mínimo. El analizador anterior fallaba en silencio: un plan
  // vacío, una cabecera con otra forma o un `**Branch:**` con otro espaciado
  // daban cero ramas y el control pasaba sin haber mirado nada.
  if (tasks === 0) {
    failures.push('el plan no declara ninguna tarea `### [ ] ...`: el analizador no reconoce su formato')
    return failures
  }
  if (tasksWithoutDeclaration > 0) {
    failures.push(
      `${tasksWithoutDeclaration} de las ${tasks} tareas del plan no declaran su rama antes de la ` +
        'cabecera siguiente. Falta la línea "**Branch:**", o no sigue el formato que el analizador reconoce.',
    )
  }

  for (const { name, pending } of branches) {
    if (!pending) continue
    const problem = branchProblem(name)
    if (problem) failures.push(`"${name}" ${problem}`)
  }

  return failures
}
