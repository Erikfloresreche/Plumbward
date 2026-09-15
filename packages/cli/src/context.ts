import { parseYamlToJson, stringifyYaml } from '@plumbward/ast'
import { CONFIG_FILE, readFileIfExists, resolveInRepo } from '@plumbward/core'
import { scanRepository } from '@plumbward/scanner'
import type { RepoScan } from '@plumbward/scanner'
import { PackRegistry, recommendedProfile } from '@plumbward/packs-sdk'
import type { Profile, RepoContext } from '@plumbward/packs-sdk'
import { nodeTsPack } from '@plumbward/pack-node-ts'

export const CLI_VERSION = '0.1.0'

/**
 * Registry of the available packs.
 *
 * In production this list will be resolved against the remote catalogue
 * according to the licence; in the MVP it is linked statically so it can be
 * tested end to end.
 */
export function buildRegistry(): PackRegistry {
  return new PackRegistry([nodeTsPack])
}

/**
 * Translates the field names of earlier versions of the profile.
 *
 * Until 2026-09-11 the profile had `main` and `dev`, which mixed two roles
 * (ADR 0005). `dev` becomes `integration`. `main` is **not** translated to
 * `release`: it was a guessed value, and turning it into the deploy branch
 * would be exactly the mistake the change avoids. An explicit `release`, on
 * the other hand, is respected.
 */
function normaliseBranches(raw: Record<string, unknown> | undefined): Profile['branches'] {
  // An empty string or a value of another type counts as "not configured":
  // `release: ""` generated a workflow with `branches: []` that `doctor` accepted.
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null
  const source = raw ?? {}
  return {
    // The first key with a value: the new one, or the old `dev` and `main`. An
    // old `dev: null` does not cancel a `main` that did have a value.
    integration: text(source['integration']) ?? text(source['dev']) ?? text(source['main']),
    release: text(source['release']),
    staging: text(source['staging']),
  }
}

/**
 * Loads the profile from `.governance/config.yml` or, if it does not exist,
 * derives the recommended one from the scan.
 *
 * The file is the source of truth: as long as it does not change, the CLI
 * produces exactly the same plan again and again.
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
    if (typeof parsed !== 'object' || parsed === null) throw new Error('empty content')
    // The recommended profile acts as the base: that way a config.yml from an
    // old version keeps working when new fields are added.
    const base = recommendedProfile(scan)
    const fromFile = parsed as Partial<Profile> & { branches?: Record<string, unknown> }
    const profile = {
      ...base,
      ...fromFile,
      // With a file, the branches come ONLY from the file: a branch it does not
      // declare stays unconfigured, and is never filled in from the local state
      // of the clone. Otherwise two clones with the same config.yml and a
      // different origin/HEAD generated different workflows (invariant 2).
      branches: normaliseBranches(fromFile.branches),
    } as Profile
    return { profile, fromFile: true }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new Error(`The file ${CONFIG_FILE} cannot be read: ${detail}`)
  }
}

/** Scans the repository and prepares the context the packs consume. */
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

/**
 * Serialises the profile with explanatory comments in the profile language:
 * English by default, Spanish with `language: es` (F0-45).
 */
export function profileToYaml(profile: Profile): string {
  const body = stringifyYaml(profile)
  return `${profile.language === 'es' ? CONFIG_HEADER_ES : CONFIG_HEADER_EN}${body}`
}

const CONFIG_HEADER_EN = `# ---------------------------------------------------------------------------
# Governance configuration of the repository
#
# This file is the SOURCE OF TRUTH: the CLI is a deterministic function of its
# content. Change it through a Pull Request and run \`plumbward plan\` again to
# see exactly what the change would imply.
#
# Fields:
#   strictness    "strict" or "moderate". Sets how hard the linter and thresholds are.
#   mode          Application mode derived from the size of the repository:
#                 greenfield | ratchet | non-disruptive
#   branches      Role of each branch. Any of them can be null.
#                   integration  Branch the Pull Requests go to. It was proposed
#                                from the remote when this file was created:
#                                check that it is the right one. If you delete
#                                it, it stays unconfigured; it is not deduced again.
#                   release      Branch that deploys to production.
#                                It is NEVER deduced: write it yourself. Without
#                                it the deploy workflow is not generated.
#                   staging      Pre-production branch, if you use one.
#   deployTarget  vercel | aws | docker | render | none
#   devcontainer  Generates a containerised development environment.
#   aiAssistants  Assistants that get rule files generated.
#   language      Language of the generated texts and comments: "en" (the
#                 default) or "es".
#   agentBoundaries
#                 What an AI assistant is forbidden to RUN:
#                   git             true = it does not run commit, push, merge,
#                                   rebase or reset; a person runs them.
#                                   Read-only commands are allowed.
#                   database        true = it does not run migrations, seeds or
#                                   writes; a person runs them. Inspection
#                                   SELECTs are allowed.
#                   commitLanguage  Language of commit messages and Pull Request
#                                   descriptions.
#                 Turning them off is a team decision: do it in a PR so it is
#                 reviewed and audited.
# ---------------------------------------------------------------------------
`

const CONFIG_HEADER_ES = `# ---------------------------------------------------------------------------
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
#   language      Idioma de los textos y comentarios generados: "en" (por
#                 defecto) o "es".
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
`
