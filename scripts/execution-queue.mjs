/**
 * Control de la cola de ejecución del plan.
 *
 * La cola, en el §5 de `docs/EXECUTION_PLAN.md`, dice en qué orden se
 * ejecutan las tareas pendientes. La siguiente tarea es siempre la primera: así
 * saber por dónde va el plan no depende de que nadie recuerde ni proponga nada,
 * y cualquier sesión llega a la misma respuesta. Cambiar una prioridad es mover
 * una entrada.
 *
 * Un orden escrito a mano caduca en cuanto se cierra o se crea una tarea. Este
 * control lo impide: toda tarea pendiente está en la cola exactamente una vez,
 * ninguna completada sigue en ella, y ninguna aparece antes que aquello de lo
 * que depende. Una tarea nueva sin sitio en la cola pone la CI en rojo, que es
 * lo que obliga a decidir su orden en el momento de crearla.
 *
 * Funciones puras, como `branch-names.mjs`: `check-coherence.mjs` sólo las
 * conecta. Tarea F0-40.
 */

export const QUEUE_START = '<!-- queue:start -->'
export const QUEUE_END = '<!-- queue:end -->'

const TASK_HEADER = /^### \[( |x)\] (F(\d+)-\d+) — /
const QUEUE_ENTRY = /^- \*\*(F\d+-\d+)\*\*/
const TASK_ID = /F\d+-\d+/g
const WHOLE_PHASE = /Phase (\d+) complete/g
const DEPENDS_ON = '**Depends on:**'

/**
 * @typedef {object} PlanTask
 * @property {string} id
 * @property {number} phase
 * @property {boolean} done
 * @property {boolean} declaresDependencies whether the task has a `**Depends on:**` line
 * @property {string[]} dependsOnTasks
 * @property {number[]} dependsOnPhases
 */

/**
 * Tareas del plan con su estado y sus dependencias.
 *
 * La dependencia se lee de la primera línea `**Depends on:**` del bloque de la
 * tarea, hasta el siguiente ` · ` o el final de la línea: `**Blocks:**` va en
 * la misma línea y sus identificadores no son dependencias.
 *
 * @param {string} text
 * @returns {PlanTask[]}
 */
export function parseTasks(text) {
  /** @type {PlanTask[]} */
  const tasks = []
  /** @type {PlanTask | undefined} */
  let current
  for (const line of text.split('\n')) {
    const header = TASK_HEADER.exec(line)
    if (header) {
      current = {
        id: header[2],
        phase: Number(header[3]),
        done: header[1] === 'x',
        declaresDependencies: false,
        dependsOnTasks: [],
        dependsOnPhases: [],
      }
      tasks.push(current)
      continue
    }
    if (/^#{2,3} /.test(line)) {
      current = undefined
      continue
    }
    if (!current || current.declaresDependencies) continue
    const at = line.indexOf(DEPENDS_ON)
    if (at === -1) continue
    current.declaresDependencies = true
    const declared = line.slice(at + DEPENDS_ON.length).split(' · ')[0]
    current.dependsOnTasks = declared.match(TASK_ID) ?? []
    current.dependsOnPhases = [...declared.matchAll(WHOLE_PHASE)].map((match) => Number(match[1]))
  }
  return tasks
}

/**
 * Identificadores de la cola, en orden. `undefined` si faltan los marcadores.
 *
 * @param {string} text
 * @returns {string[] | undefined}
 */
export function parseQueue(text) {
  const start = text.indexOf(QUEUE_START)
  const end = text.indexOf(QUEUE_END)
  if (start === -1 || end === -1 || end < start) return undefined
  return text
    .slice(start + QUEUE_START.length, end)
    .split('\n')
    .map((line) => QUEUE_ENTRY.exec(line)?.[1])
    .filter((id) => id !== undefined)
}

/**
 * La tarea que toca ahora: la primera de la cola.
 *
 * @param {string} text
 * @returns {string | undefined}
 */
export function nextTask(text) {
  return parseQueue(text)?.[0]
}

/**
 * Motivos por los que la cola no describe el plan. Vacío si está bien.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function checkQueue(text) {
  /** @type {string[]} */
  const failures = []
  const tasks = parseTasks(text)
  const queue = parseQueue(text)

  // Aserción de mínimo, como en `checkPlan`: un plan que el analizador no
  // reconoce daría cero tareas y el control pasaría sin haber mirado nada.
  if (tasks.length === 0) {
    return ['el plan no declara ninguna tarea `### [ ] ...`: el analizador no reconoce su formato']
  }
  if (queue === undefined) {
    return [`el plan no tiene cola de ejecución entre \`${QUEUE_START}\` y \`${QUEUE_END}\``]
  }

  // Same minimum assertion, per task: a dependency line the parser does not
  // recognise reads as "no dependencies", and a broken order would pass (F0-42).
  for (const task of tasks) {
    if (!task.declaresDependencies) {
      failures.push(`${task.id} has no \`${DEPENDS_ON}\` line: the parser cannot read its dependencies`)
    }
  }

  const byId = new Map(tasks.map((task) => [task.id, task]))
  /** @type {Map<string, number>} */
  const position = new Map()

  queue.forEach((id, index) => {
    const task = byId.get(id)
    if (!task) {
      failures.push(`${id} está en la cola y no existe en el plan`)
    } else if (task.done) {
      failures.push(`${id} está completada y sigue en la cola: sácala al marcar su casilla`)
    }
    if (position.has(id)) {
      failures.push(`${id} aparece más de una vez en la cola`)
    } else {
      position.set(id, index)
    }
  })

  for (const task of tasks) {
    if (!task.done && !position.has(task.id)) {
      failures.push(`${task.id} está pendiente y no está en la cola: decide su sitio al crearla`)
    }
  }

  /** @param {string} dependency @param {string} id @param {number} index @param {string} label */
  const requireBefore = (dependency, id, index, label) => {
    const target = byId.get(dependency)
    if (!target) {
      failures.push(`${id} depende de ${dependency}, que no existe en el plan`)
      return
    }
    if (target.done) return
    const at = position.get(dependency)
    if (at === undefined || at > index) {
      failures.push(`${id} está en la cola antes que ${dependency}, de la que depende${label}`)
    }
  }

  queue.forEach((id, index) => {
    const task = byId.get(id)
    if (!task || position.get(id) !== index) return
    for (const dependency of task.dependsOnTasks) requireBefore(dependency, id, index, '')
    for (const phase of task.dependsOnPhases) {
      for (const member of tasks) {
        if (member.phase === phase) requireBefore(member.id, id, index, ` (Phase ${phase} complete)`)
      }
    }
  })

  return failures
}
