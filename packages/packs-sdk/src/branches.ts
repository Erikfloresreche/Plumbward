import type { Profile } from './contract.js'

/**
 * Nombres habituales de ramas de larga duración.
 *
 * Es sólo una red de seguridad, no la fuente de verdad: esa es el perfil. Existe
 * porque hay repositorios sin `config.yml` todavía, y porque la rama por defecto
 * detectada puede estar desfasada (ver `GitState.defaultBranch`).
 *
 * Incluye convenciones en español, con y sin tilde, porque el mercado inicial
 * son agencias españolas y un equipo no debería tener que llamar `main` a su
 * rama para que la herramienta la respete.
 */
export const LONG_LIVED_BRANCH_NAMES: readonly string[] = [
  'main',
  'master',
  'trunk',
  'prod',
  'production',
  'release',
  'develop',
  'development',
  'dev',
  'staging',
  'stage',
  'produccion',
  'producción',
  'desarrollo',
]

/**
 * Nombres de rama de releases, **por orden de preferencia**. Si un repositorio
 * tiene `Prod` y `main`, la de releases es `Prod`: es el nombre más específico.
 */
const RELEASE_BRANCH_PRIORITY: readonly string[] = [
  'prod',
  'production',
  'producción',
  'produccion',
  'main',
  'master',
  'release',
  'trunk',
]

/** Nombres de rama de integración, por orden de preferencia. */
const INTEGRATION_BRANCH_PRIORITY: readonly string[] = ['develop', 'development', 'desarrollo', 'dev']

export interface BranchRoles {
  /** Rama de releases, con el nombre exacto que tiene en el repositorio. */
  readonly release: string | null
  /** Rama de integración, si existe. */
  readonly integration: string | null
}

/**
 * Deduce el papel de cada rama a partir de las que **existen** en el
 * repositorio.
 *
 * No usa la rama por defecto del remoto. Esa es la rama por defecto de GitHub,
 * que no tiene por qué ser la de releases: en git-flow es `develop`. Usarla como
 * rama de releases llegó a hacer que la CI generada desplegara a producción
 * desde `develop`.
 */
export function detectBranchRoles(branches: readonly string[]): BranchRoles {
  const find = (priority: readonly string[]): string | null => {
    for (const wanted of priority) {
      const match = branches.find((name) => name.toLowerCase() === wanted)
      if (match !== undefined) return match
    }
    return null
  }
  return { release: find(RELEASE_BRANCH_PRIORITY), integration: find(INTEGRATION_BRANCH_PRIORITY) }
}

/**
 * Ramas que la herramienta nunca modifica directamente: sobre ellas, `apply`
 * crea antes una rama aislada.
 *
 * Es una **unión** a propósito. Cada fuente puede fallar por su lado —el perfil
 * puede no existir aún, la rama por defecto puede estar desfasada, la lista de
 * respaldo no conoce todas las convenciones— y con una unión un dato erróneo
 * sólo puede añadir protección, nunca quitarla. El coste de un falso positivo es
 * una rama de trabajo innecesaria; el de un falso negativo, escribir sobre
 * producción.
 */
export function longLivedBranches(
  profile: Pick<Profile, 'branches'>,
  defaultBranch: string | null,
): ReadonlySet<string> {
  const candidates = [
    profile.branches.main,
    profile.branches.staging,
    profile.branches.dev,
    defaultBranch,
    ...LONG_LIVED_BRANCH_NAMES,
  ]
  return new Set(
    candidates
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
      .map((name) => name.toLowerCase()),
  )
}

/**
 * ¿Es esta rama de larga duración?
 *
 * No distingue mayúsculas. Git sí lo hace —`Prod` y `prod` son ramas
 * distintas—, pero aquí la pregunta es "¿parece una rama que no se debe tocar
 * directamente?", y ante la duda la respuesta segura es sí.
 */
export function isLongLivedBranch(
  branch: string,
  profile: Pick<Profile, 'branches'>,
  defaultBranch: string | null,
): boolean {
  return longLivedBranches(profile, defaultBranch).has(branch.toLowerCase())
}
