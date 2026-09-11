import { parseYamlToJson } from '@plumbward/ast'
import { readFileIfExists, resolveInRepo } from '@plumbward/core'
import type { HealthCheck, RepoContext } from '@plumbward/packs-sdk'

/**
 * Comprobaciones que leen los workflows **tal como están en el repositorio**.
 *
 * `apply` no pisa ficheros existentes, así que un workflow generado por una
 * versión anterior puede seguir haciendo lo que la configuración actual ya no
 * dice: desplegar desde una rama que nadie eligió, o revisar sólo las PRs a una
 * rama. Mirar la configuración no basta; hay que leer el fichero.
 *
 * Ante la duda, avisan: un workflow que no se puede interpretar se trata como
 * sospechoso (ADR 0005: fallar hacia más protección).
 */

const PROD_WORKFLOW = '.github/workflows/ci-prod.yml'
const DEV_WORKFLOW = '.github/workflows/ci-dev.yml'

/**
 * Ramas de un disparador: una lista si filtra por rama, `null` si se dispara en
 * todas, `undefined` si el disparador no existe o el fichero no se entiende.
 */
export function triggerBranches(text: string, event: 'push' | 'pull_request'): string[] | null | undefined {
  let doc: unknown
  try {
    doc = parseYamlToJson(text)
  } catch {
    return undefined
  }
  if (typeof doc !== 'object' || doc === null) return undefined
  // En YAML 1.1 la clave `on` puede leerse como el booleano `true`.
  const record = doc as Record<string, unknown>
  const on = record['on'] ?? record['true']
  if (typeof on !== 'object' || on === null || !(event in on)) return undefined
  const trigger = (on as Record<string, unknown>)[event]
  if (trigger === null || typeof trigger !== 'object') return null
  const branches = (trigger as Record<string, unknown>)['branches']
  if (branches === undefined) return null
  if (!Array.isArray(branches) || !branches.every((b) => typeof b === 'string')) return undefined
  return branches as string[]
}

async function read(context: RepoContext, path: string): Promise<string | undefined> {
  return readFileIfExists(resolveInRepo(context.scan.repoRoot, path))
}

async function releaseCheck(context: RepoContext): Promise<HealthCheck | undefined> {
  const { deployTarget, branches } = context.profile
  const release = branches.release
  const prodText = await read(context, PROD_WORKFLOW)
  if (deployTarget === 'none' && prodText === undefined) return undefined

  const base = { id: 'release-branch', label: 'Rama de despliegue configurada' }
  const configureHint =
    'Indica en `.governance/config.yml` la rama desde la que se despliega (`branches.release`). Plumbward no la deduce: desplegar desde una rama adivinada no se puede deshacer.'

  if (prodText === undefined) {
    return release !== null
      ? { ...base, ok: true, detail: `Se desplegará a producción desde "${release}".` }
      : {
          ...base,
          ok: false,
          detail: `Hay un destino de despliegue (${deployTarget}) pero ninguna rama de despliegue: no se ha generado el workflow de producción.`,
          fixHint: configureHint,
        }
  }

  const deploysFrom = triggerBranches(prodText, 'push')
  const fileHint = `Revisa desde qué rama despliega ${PROD_WORKFLOW} y que coincida con \`branches.release\`, o borra el workflow.`
  if (release === null) {
    return {
      ...base,
      ok: false,
      detail: `Existe ${PROD_WORKFLOW} pero no hay rama de despliegue configurada: puede estar desplegando desde una rama que nadie eligió.`,
      fixHint: fileHint,
    }
  }
  if (deploysFrom === undefined) {
    return { ...base, ok: false, detail: `No se puede determinar desde qué rama despliega ${PROD_WORKFLOW}.`, fixHint: fileHint }
  }
  if (deploysFrom === null) {
    return { ...base, ok: false, detail: `${PROD_WORKFLOW} despliega al hacer push en cualquier rama.`, fixHint: fileHint }
  }
  if (deploysFrom.length !== 1 || deploysFrom[0] !== release) {
    return {
      ...base,
      ok: false,
      detail: `${PROD_WORKFLOW} despliega desde [${deploysFrom.join(', ')}], pero la rama de despliegue configurada es "${release}".`,
      fixHint: fileHint,
    }
  }
  return { ...base, ok: true, detail: `Se despliega a producción desde "${release}".` }
}

async function pullRequestCoverageCheck(context: RepoContext): Promise<HealthCheck | undefined> {
  const devText = await read(context, DEV_WORKFLOW)
  if (devText === undefined) return undefined
  const base = { id: 'pr-coverage', label: 'Todas las Pull Requests pasan por la CI' }
  const hint = `Quita el filtro de ramas de \`pull_request\` en ${DEV_WORKFLOW}: la CI debe revisar todas las PRs.`
  const filter = triggerBranches(devText, 'pull_request')
  if (filter === null) return { ...base, ok: true, detail: 'Se revisan todas las Pull Requests.' }
  if (filter === undefined) {
    return { ...base, ok: false, detail: `No se puede verificar a qué Pull Requests se aplica ${DEV_WORKFLOW}.`, fixHint: hint }
  }
  return {
    ...base,
    ok: false,
    detail: `Sólo se revisan las PRs dirigidas a [${filter.join(', ')}]; las demás no pasan por la CI.`,
    fixHint: hint,
  }
}

export async function workflowChecks(context: RepoContext): Promise<HealthCheck[]> {
  const checks = await Promise.all([releaseCheck(context), pullRequestCoverageCheck(context)])
  return checks.filter((check): check is HealthCheck => check !== undefined)
}
