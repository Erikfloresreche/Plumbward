/**
 * Branch name control: format, language and exemptions.
 *
 * It lives outside `check-coherence.mjs` because that script runs everything on
 * load and ends in `process.exit`: it could not be tested. Here there are only
 * pure functions, and `scripts/branch-names.test.mjs` covers them with the
 * corpus in `branch-names-corpus.json`.
 *
 * Task F0-15.
 */

/**
 * Format `<type>/f<phase>-<slug>`.
 *
 * The phase is `0` or a number with no leading zeros, of two digits at most: it
 * used to be `f\d+` and accepted `f00` and `f999`, which are not phases.
 */
export const BRANCH_FORMAT =
  /^(feat|fix|refactor|test|docs|build|ci|chore)\/f(0|[1-9][0-9]?)-[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Permanent branches of the repository. They are not task branches and do not
 * follow the format: a release is a Pull Request from `develop` to `Prod`, and
 * with the control active in CI that PR failed.
 *
 * It is an explicit list, not a pattern: a pattern becomes a back door again,
 * which is exactly what failed with the `dependabot/` prefix.
 */
export const PERMANENT_BRANCHES = ['Prod', 'develop']

/**
 * Frequent Spanish content words in our branch names.
 *
 * The list comes from the corpus, not from intuition: they are the words needed
 * to detect the names PR #6 itself renamed and that no ending recognises. All of
 * them are unambiguously Spanish — `metricas`, not `metrics`; `guia`, not
 * `guide` — so as not to reject valid English names.
 */
export const SPANISH_WORDS = new Set([
  'rama', 'ramas', 'regla', 'reglas', 'prueba', 'pruebas', 'paquete', 'informe',
  'guia', 'flujo', 'flujos', 'controles', 'propio', 'documentacion', 'unica',
  'unico', 'cobertura', 'umbral', 'trinquete', 'metricas', 'reales',
])

/**
 * Spanish function words. They only count as a signal **between** two other
 * components of the slug.
 *
 * In Spanish they join two words (`gobierno-de-ramas`, `landing-y-demo`); in
 * English they appear at the start as a prefix or label (`de-duplicate`,
 * `y-axis`), and there they say nothing. The previous list did not tell the
 * position apart and rejected both English names.
 */
const SPANISH_FUNCTION_WORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'con', 'para', 'por', 'al', 'sin',
])

/**
 * Endings that do not exist in English. They generalise much better than a word
 * list: they cover half of the names the list let through without enumerating
 * the vocabulary of the project.
 *
 * `minLength` discards short English words with the same ending: `dad`, `aid`,
 * `via`. **It does not discard the long ones**: `fascia`, `aikido` and
 * `granddad` would be flagged as Spanish. It is a collision accepted knowingly,
 * not an oversight — raising the threshold to 7 would lose `gracia`, which is as
 * long as `fascia` and is in the corpus. None of those words appears in a
 * branch name of this repository; if one ever does, it is added to the corpus
 * as a negative and decided then.
 *
 * `-ado`/`-ada` is not included: the corpus does not need it and English has
 * `tornado`, `avocado` and `bravado`.
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
 * Returns the signs that a slug is in Spanish. Empty = none.
 *
 * @param {string} slug the name without `<type>/f<phase>-`
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
 * @returns {string | undefined} the reason why the name is not valid
 */
export function branchProblem(branch) {
  if (/[^\x00-\x7F]/.test(branch)) return 'contains non-ASCII characters'
  if (!BRANCH_FORMAT.test(branch)) return 'does not follow the format <type>/f<phase>-<slug>'
  const slug = branch.split('/')[1].replace(/^f\d+-/, '')
  const evidence = spanishEvidence(slug)
  if (evidence.length > 0) return `looks Spanish (${evidence.join(', ')})`
  return undefined
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Reason why a branch is exempt from the format, if any.
 *
 * The exemption is by **author** whenever possible, not by name: the
 * `dependabot/` prefix was a back door because anyone could name their branch
 * that way (`dependabot/../fix/f0-ramas` passed). GitHub sets the author.
 *
 * @param {string} branch
 * @param {string | undefined} actor the `github.actor` that opens the Pull Request
 * @returns {string | undefined}
 */
export function branchExemption(branch, actor) {
  if (PERMANENT_BRANCHES.includes(branch)) return 'permanent branch of the repository'

  // Any bot: dependabot, renovate, github-actions. GitHub adds the `[bot]`
  // suffix to the login and it cannot be forged from the branch name.
  if (actor && actor.endsWith('[bot]')) return `branch created by the bot ${actor}`

  // `<login>-patch-<n>`: the GitHub web editor, which external contributors
  // will use since the repository is public. It is only accepted if the login
  // in the name is the author's, so the exemption is still by author.
  if (actor && new RegExp(`^${escapeRegExp(actor)}-patch-\\d+$`).test(branch)) {
    return 'GitHub web editor branch'
  }

  // `revert-<pr>-<branch>`: the GitHub Revert button. GitHub builds the name from
  // a branch that already passed the control, so the reverted branch is
  // required to be valid: `revert-1-lo-que-sea` does not pass.
  const reverted = /^revert-\d+-(.+)$/.exec(branch)?.[1]
  if (reverted && (PERMANENT_BRANCHES.includes(reverted) || !branchProblem(reverted))) {
    return 'GitHub Revert button branch'
  }

  return undefined
}

/**
 * @param {string | undefined} branch the branch of the current PR
 * @param {string | undefined} actor
 * @returns {string | undefined} the reason for the failure, if any
 */
export function checkPullRequestBranch(branch, actor) {
  if (!branch) return undefined
  if (branchExemption(branch, actor)) return undefined
  return branchProblem(branch)
}

/**
 * Extracts the tasks and their branches from the execution plan.
 *
 * It recognises `### [ ]`, `### [x]` and `### [X]`. Any other heading closes
 * the previous task: before, the `pending` state survived headings that are not
 * tasks and attributed branches to the wrong task.
 *
 * `declarations` counts every `**Branch:**` line; `branches`, only the ones that
 * name a branch between backticks. They are not the same: two tasks of the plan
 * declare on purpose that they have no code branch ("GitHub configuration",
 * "separate repository").
 *
 * `tasksWithoutDeclaration` is counted **per task**, not by comparing totals: a
 * `**Branch:**` line hanging from a heading that is not a task would make up for
 * the missing one, and the task without a branch would pass again without anyone
 * judging it. It is the same silent failure the assertion came to close.
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
 * Checks the branches planned for the PENDING tasks of the plan. Closed ones are
 * skipped on purpose: their name is a historical fact, not a convention.
 *
 * @param {string} text
 * @returns {string[]} the failures found
 */
export function checkPlan(text) {
  /** @type {string[]} */
  const failures = []
  const { tasks, tasksWithoutDeclaration, branches } = parsePlan(text)

  // Minimum assertion. The previous parser failed in silence: an empty plan, a
  // heading with another shape or a `**Branch:**` with other spacing gave zero
  // branches and the control passed without looking at anything.
  if (tasks === 0) {
    failures.push('the plan declares no `### [ ] ...` task: the parser does not recognise its format')
    return failures
  }
  if (tasksWithoutDeclaration > 0) {
    failures.push(
      `${tasksWithoutDeclaration} of the ${tasks} plan tasks do not declare their branch before the ` +
        'next heading. The "**Branch:**" line is missing, or does not follow the format the parser recognises.',
    )
  }

  for (const { name, pending } of branches) {
    if (!pending) continue
    const problem = branchProblem(name)
    if (problem) failures.push(`"${name}" ${problem}`)
  }

  return failures
}
