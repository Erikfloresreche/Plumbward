import type { Profile } from './contract.js'

/**
 * Decisiones sobre ramas.
 *
 * Todo este fichero sigue un principio (ADR 0005): **cuando una deducción
 * falla, debe fallar hacia más protección, nunca hacia una acción.** Tres
 * versiones anteriores intentaron deducir cuál es la rama de releases, y cada
 * una arreglaba unos repositorios y rompía otros. Aquí la única deducción que
 * decide es "¿es esto una rama de trabajo?", y su fallo cae del lado seguro: un
 * nombre que no se reconoce se aísla.
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
  // Ramas que crean los propios asistentes de IA. Son usuarios directos de
  // este producto, y aislar su trabajo en otra rama lo desordenaría.
  'claude',
  'copilot',
  'codex',
  'cursor',
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
 * Salen **sólo del perfil**, y con `config.yml` el perfil de ramas sale sólo del
 * fichero: el estado local del repositorio únicamente se usa para proponer el
 * fichero inicial, nunca al regenerar. Una versión
 * anterior añadía las ramas remotas existentes, y dos copias del mismo
 * repositorio con el mismo `config.yml` generaban workflows distintos según las
 * referencias huérfanas que tuviera cada una: rompía el invariante de que la CLI
 * es una función determinista de su configuración. Las Pull Requests no
 * dependen de esto: la CI generada las revisa todas.
 */
export function ciPushBranches(profile: Pick<Profile, 'branches'>): string[] {
  const names: string[] = []
  for (const name of [profile.branches.integration, profile.branches.release, profile.branches.staging]) {
    if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name)
  }
  return names
}
