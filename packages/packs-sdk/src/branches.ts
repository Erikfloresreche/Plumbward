import type { Profile } from './contract.js'

/**
 * Nombres habituales de ramas de larga duración.
 *
 * Es sólo una red de seguridad, no la fuente de verdad: esa es el perfil. Existe
 * porque hay repositorios sin `config.yml` todavía, y porque la rama por defecto
 * detectada puede estar desfasada (ver `GitState.defaultBranch`).
 *
 * Se incluyen convenciones en español porque el mercado inicial son agencias
 * españolas, y porque un equipo no debería tener que llamar `main` a su rama
 * para que la herramienta la respete.
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
  'desarrollo',
]

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
  const nombres = [
    profile.branches.main,
    profile.branches.staging,
    profile.branches.dev,
    defaultBranch,
    ...LONG_LIVED_BRANCH_NAMES,
  ]
  return new Set(
    nombres.filter((n): n is string => typeof n === 'string' && n.length > 0).map((n) => n.toLowerCase()),
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
