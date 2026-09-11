import type { Profile } from './contract.js'

/**
 * Decisiones sobre ramas.
 *
 * Todo este fichero sigue un principio (ADR 0005): **lo que se deduce del
 * repositorio sólo puede ampliar las protecciones, nunca reducirlas ni decidir
 * una acción.** Tres versiones anteriores intentaron deducir cuál es la rama de
 * releases a partir de nombres o de la rama por defecto, y cada una arreglaba
 * unos repositorios y rompía otros. Aquí no se adivina: se protege todo lo que
 * no sea claramente trabajo, y lo que desencadena acciones se configura.
 */

/**
 * Prefijos de las ramas de trabajo.
 *
 * Es la lista que se puede cerrar: los prefijos de trabajo son una convención
 * extendida y estable (Conventional Commits, git-flow, bots de dependencias). Los
 * nombres de ramas de larga duración, en cambio, no se pueden enumerar —`Prod`,
 * `pro`, `pre`, `live`, `release/prod`…—, y por eso la decisión se apoya en esta
 * lista y no en aquélla.
 *
 * `release/` no está a propósito: en muchos equipos es de larga duración.
 */
export const WORK_BRANCH_PREFIXES: readonly string[] = [
  'feat',
  'feature',
  'fix',
  'bugfix',
  'hotfix',
  'chore',
  'docs',
  'refactor',
  'test',
  'tests',
  'build',
  'ci',
  'perf',
  'style',
  'revert',
  'dependabot',
  'renovate',
]

/**
 * Nombres habituales de ramas de larga duración.
 *
 * Ya no decide qué se protege —eso lo hace `isWorkBranch`—. Sólo se usa para
 * **ampliar** la lista de ramas en las que la CI generada se ejecuta al hacer
 * push. Incluye convenciones en español, con y sin tilde.
 */
export const LONG_LIVED_BRANCH_NAMES: readonly string[] = [
  'main',
  'master',
  'trunk',
  'prod',
  'production',
  'develop',
  'development',
  'dev',
  'staging',
  'stage',
  'produccion',
  'producción',
  'desarrollo',
]

/** ¿Es una rama de trabajo, de las que se crean para una tarea y se borran? */
export function isWorkBranch(branch: string): boolean {
  const slash = branch.indexOf('/')
  if (slash <= 0 || slash === branch.length - 1) return false
  return WORK_BRANCH_PREFIXES.includes(branch.slice(0, slash).toLowerCase())
}

/** Ramas que el perfil o el remoto señalan explícitamente como de larga duración. */
export function configuredBranches(
  profile: Pick<Profile, 'branches'>,
  defaultBranch: string | null,
): ReadonlySet<string> {
  const candidates = [
    profile.branches.integration,
    profile.branches.release,
    profile.branches.staging,
    defaultBranch,
  ]
  return new Set(
    candidates
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
      .map((name) => name.toLowerCase()),
  )
}

export interface HeadState {
  readonly branch: string | null
  readonly detachedHead: boolean
  readonly defaultBranch: string | null
}

/**
 * ¿Hay que aislar el trabajo en una rama propia antes de escribir?
 *
 * Sí, salvo que se esté en una rama de trabajo reconocible que además no figure
 * como rama de larga duración en el perfil ni sea la rama por defecto. Un nombre
 * desconocido cae del lado seguro: el peor caso es una rama aislada innecesaria,
 * frente a escribir directamente sobre producción.
 */
export function requiresIsolation(head: HeadState, profile: Pick<Profile, 'branches'>): boolean {
  if (head.detachedHead) return true
  if (head.branch === null) return false
  if (configuredBranches(profile, head.defaultBranch).has(head.branch.toLowerCase())) return true
  return !isWorkBranch(head.branch)
}

/**
 * Ramas en las que la CI generada se ejecuta al hacer push.
 *
 * Es una unión que sólo amplía: las del perfil, la rama por defecto y las ramas
 * existentes que tengan un nombre habitual de larga duración. Ejecutar la CI de
 * más cuesta minutos; de menos, dejar una rama sin comprobar. Las Pull Requests
 * no dependen de esto: la CI generada las revisa todas.
 */
export function ciPushBranches(
  profile: Pick<Profile, 'branches'>,
  defaultBranch: string | null,
  existingBranches: readonly string[],
): string[] {
  const names: string[] = []
  const add = (name: string | null): void => {
    if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name)
  }
  add(profile.branches.integration)
  add(profile.branches.release)
  add(profile.branches.staging)
  add(defaultBranch)
  for (const name of existingBranches) {
    if (LONG_LIVED_BRANCH_NAMES.includes(name.toLowerCase())) add(name)
  }
  return names
}
