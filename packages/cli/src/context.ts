import { parseYamlToJson, stringifyYaml } from '@plumbward/ast'
import { CONFIG_FILE, readFileIfExists, resolveInRepo } from '@plumbward/core'
import { scanRepository } from '@plumbward/scanner'
import type { RepoScan } from '@plumbward/scanner'
import { PackRegistry, recommendedProfile } from '@plumbward/packs-sdk'
import type { Profile, RepoContext } from '@plumbward/packs-sdk'
import { nodeTsPack } from '@plumbward/pack-node-ts'

export const CLI_VERSION = '0.1.0'

/**
 * Registro de packs disponibles.
 *
 * En producción este listado se resolverá contra el catálogo remoto según la
 * licencia; en el MVP se enlaza estáticamente para poder probar de punta a punta.
 */
export function buildRegistry(): PackRegistry {
  return new PackRegistry([nodeTsPack])
}

/**
 * Traduce los nombres de campo de versiones anteriores del perfil.
 *
 * Hasta el 2026-09-11 el perfil tenía `main` y `dev`, que mezclaban dos papeles
 * (ADR 0005). `dev` pasa a `integration`. `main` **no** se traduce a `release`:
 * era un valor adivinado, y convertirlo en rama de despliegue sería justo el
 * error que el cambio evita. Un `release` explícito, en cambio, se respeta.
 */
function normaliseBranches(raw: Record<string, unknown> | undefined): Profile['branches'] {
  // Una cadena vacía o de otro tipo cuenta como "sin configurar": `release: ""`
  // generaba un workflow con `branches: []` que `doctor` daba por bueno.
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null
  const source = raw ?? {}
  return {
    // La primera clave con valor: la nueva, o las antiguas `dev` y `main`. Un
    // `dev: null` antiguo no anula el `main` que sí tenía valor.
    integration: text(source['integration']) ?? text(source['dev']) ?? text(source['main']),
    release: text(source['release']),
    staging: text(source['staging']),
  }
}

/**
 * Carga el perfil desde `.governance/config.yml` o, si no existe, deriva el
 * recomendado del escaneo.
 *
 * El fichero es la fuente de verdad: mientras no cambie, la CLI produce
 * exactamente el mismo plan una y otra vez.
 */
export async function loadProfile(scan: RepoScan): Promise<{
  profile: Profile
  fromFile: boolean
}> {
  const raw = await readFileIfExists(resolveInRepo(scan.repoRoot, CONFIG_FILE))
  if (raw === undefined) {
    return { profile: recommendedProfile(scan), fromFile: false }
  }

  try {
    const parsed = parseYamlToJson(raw)
    if (typeof parsed !== 'object' || parsed === null) throw new Error('contenido vacío')
    // El perfil recomendado actúa como base: así un config.yml de una versión
    // antigua sigue funcionando cuando se añaden campos nuevos.
    const base = recommendedProfile(scan)
    const fromFile = parsed as Partial<Profile> & { branches?: Record<string, unknown> }
    const profile = {
      ...base,
      ...fromFile,
      // Con fichero, las ramas salen SÓLO del fichero: una rama que no declare
      // queda sin configurar, nunca se rellena con el estado local del clon.
      // Si no, dos clones con el mismo config.yml y distinto origin/HEAD
      // generaban workflows distintos (invariante 2).
      branches: normaliseBranches(fromFile.branches),
    } as Profile
    return { profile, fromFile: true }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new Error(`El fichero ${CONFIG_FILE} no se puede leer: ${detail}`)
  }
}

/** Escanea el repositorio y prepara el contexto que consumen los packs. */
export async function buildContext(cwd: string): Promise<{
  scan: RepoScan
  context: RepoContext
  profileFromFile: boolean
}> {
  const scan = await scanRepository(cwd)
  const { profile, fromFile } = await loadProfile(scan)

  return {
    scan,
    context: { scan, profile, cliVersion: CLI_VERSION },
    profileFromFile: fromFile,
  }
}

/** Serializa el perfil con comentarios explicativos en español. */
export function profileToYaml(profile: Profile): string {
  const body = stringifyYaml(profile)

  return `# ---------------------------------------------------------------------------
# Configuración de gobernanza del repositorio
#
# Este fichero es la FUENTE DE VERDAD: la CLI es una función determinista de su
# contenido. Cámbialo mediante una Pull Request y vuelve a ejecutar
# \`plumbward plan\` para ver exactamente qué implicaría el cambio.
#
# Campos:
#   strictness    "strict" o "moderate". Ajusta la dureza de linter y umbrales.
#   mode          Modo de aplicación derivado del tamaño del repositorio:
#                 greenfield | ratchet | non-disruptive
#   branches      Papel de cada rama. Cualquiera puede ser null.
#                   integration  A qué rama van las Pull Requests. Se propuso
#                                al crear este fichero a partir del remoto:
#                                revisa que sea la correcta. Si la borras,
#                                queda sin configurar; no se vuelve a deducir.
#                   release      Desde qué rama se despliega a producción.
#                                NUNCA se deduce: escríbela tú. Sin ella no se
#                                genera el workflow de despliegue.
#                   staging      Rama de preproducción, si la usáis.
#   deployTarget  vercel | aws | docker | render | none
#   devcontainer  Genera un entorno de desarrollo contenedorizado.
#   aiAssistants  Para qué asistentes se generan ficheros de reglas.
#   language      Idioma de los textos y comentarios generados.
#   agentBoundaries
#                 Qué se le prohíbe EJECUTAR a un asistente de IA:
#                   git             true = no ejecuta commit, push, merge,
#                                   rebase ni reset; los lanza una persona.
#                                   Los comandos de sólo lectura se permiten.
#                   database        true = no ejecuta migraciones, seeds ni
#                                   escrituras; las lanza una persona. Los
#                                   SELECT de inspección se permiten.
#                   commitLanguage  Idioma de los mensajes de commit y de las
#                                   descripciones de Pull Request.
#                 Desactivarlos es una decisión del equipo: hazlo en una PR
#                 para que quede revisada y auditada.
# ---------------------------------------------------------------------------
${body}`
}
