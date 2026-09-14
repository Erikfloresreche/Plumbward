/**
 * Control of the execution queue of the plan.
 *
 * The queue, in §5 of `docs/EXECUTION_PLAN.md`, says in which order the pending
 * tasks are run. The next task is always the first one: that way, knowing where
 * the plan stands does not depend on anyone remembering or proposing anything,
 * and every session reaches the same answer. Changing a priority is moving an
 * entry.
 *
 * An order written by hand goes stale as soon as a task is closed or created.
 * This control prevents it: every pending task is in the queue exactly once, no
 * completed one is still in it, and none appears before what it depends on. A
 * new task with no place in the queue turns the CI red, which is what forces
 * deciding its order at the moment it is created.
 *
 * Pure functions, like `branch-names.mjs`: `check-coherence.mjs` only wires
 * them. Task F0-40.
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
 * Tasks of the plan with their state and dependencies.
 *
 * The dependency is read from the first `**Depends on:**` line of the task
 * block, up to the next ` · ` or the end of the line: `**Blocks:**` goes on the
 * same line and its identifiers are not dependencies.
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
 * Identifiers of the queue, in order. `undefined` if the markers are missing.
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
 * The task that comes now: the first one in the queue.
 *
 * @param {string} text
 * @returns {string | undefined}
 */
export function nextTask(text) {
  return parseQueue(text)?.[0]
}

/**
 * Reasons why the queue does not describe the plan. Empty if it is fine.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function checkQueue(text) {
  /** @type {string[]} */
  const failures = []
  const tasks = parseTasks(text)
  const queue = parseQueue(text)

  // Minimum assertion, as in `checkPlan`: a plan the parser does not recognise
  // would give zero tasks and the control would pass without looking at anything.
  if (tasks.length === 0) {
    return ['the plan declares no `### [ ] ...` task: the parser does not recognise its format']
  }
  if (queue === undefined) {
    return [`the plan has no execution queue between \`${QUEUE_START}\` and \`${QUEUE_END}\``]
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
      failures.push(`${id} is in the queue and does not exist in the plan`)
    } else if (task.done) {
      failures.push(`${id} is completed and still in the queue: take it out when ticking its checkbox`)
    }
    if (position.has(id)) {
      failures.push(`${id} appears more than once in the queue`)
    } else {
      position.set(id, index)
    }
  })

  for (const task of tasks) {
    if (!task.done && !position.has(task.id)) {
      failures.push(`${task.id} is pending and not in the queue: decide its place when creating it`)
    }
  }

  /** @param {string} dependency @param {string} id @param {number} index @param {string} label */
  const requireBefore = (dependency, id, index, label) => {
    const target = byId.get(dependency)
    if (!target) {
      failures.push(`${id} depends on ${dependency}, which does not exist in the plan`)
      return
    }
    if (target.done) return
    const at = position.get(dependency)
    if (at === undefined || at > index) {
      failures.push(`${id} is in the queue before ${dependency}, which it depends on${label}`)
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
