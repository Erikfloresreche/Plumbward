import { confirm, isCancel, log, outro } from '@clack/prompts'
import { execa } from 'execa'
import pc from 'picocolors'
import {
  ApplyFailedError,
  CONFIG_FILE,
  applyPlan,
  isBlocked,
  rollbackLastApply,
  simulatePlan,
} from '@plumbward/core'
import type { ChangePlan, CommandRunner, Operation } from '@plumbward/core'
import { branchExists } from '@plumbward/scanner'
import type { GitState } from '@plumbward/scanner'
import { file, requiresIsolation } from '@plumbward/packs-sdk'
import type { Profile } from '@plumbward/packs-sdk'
import { CLI_VERSION, buildContext, buildRegistry, profileToYaml } from './context.js'
import { error, renderHealthChecks, renderPlan, renderScan, success, warn } from './render.js'

/**
 * Rama aislada donde se integran los cambios. Nunca se trabaja directamente
 * sobre una rama de larga duración, se llame como se llame en cada equipo.
 */
export const GOVERNANCE_BRANCH = 'chore/setup-ai-governance'

/** Ejecutor real de comandos, con la salida visible para el usuario. */
const runner: CommandRunner = async (cmd, args, cwd) => {
  await execa(cmd, [...args], { cwd, stdio: 'inherit' })
}

/**
 * `scan` — diagnóstico de sólo lectura.
 *
 * No requiere licencia por diseño: es el gancho comercial. El informe crea la
 * necesidad que el resto del producto resuelve.
 */
export async function runScan(cwd: string): Promise<number> {
  const { scan } = await buildContext(cwd)
  console.log(renderScan(scan))
  console.log(
    `\n${pc.dim('Ejecuta `plumbward plan` para ver qué se configuraría, sin tocar nada.')}`,
  )
  return 0
}

/** Construye el plan añadiendo la escritura del perfil, que no pertenece a ningún pack. */
async function buildFullPlan(cwd: string): Promise<{
  plan: ChangePlan
  cwd: string
  context: Awaited<ReturnType<typeof buildContext>>
}> {
  const context = await buildContext(cwd)
  const registry = buildRegistry()
  const plan = await registry.buildPlan(context.context)

  const configOperation: Operation = file(
    CONFIG_FILE,
    profileToYaml(context.context.profile),
    'Guarda el perfil de gobernanza como fuente de verdad versionada.',
    { managed: false },
  )

  const fullPlan: ChangePlan = {
    ...plan,
    operations: [configOperation, ...plan.operations],
  }

  return { plan: fullPlan, cwd, context }
}

/**
 * `plan` — muestra el diff exacto sin escribir nada.
 *
 * Es la operación que hace segura a la herramienta: el usuario ve el resultado
 * antes de autorizarlo, y el equipo de seguridad del cliente puede auditarlo.
 */
export async function runPlan(cwd: string, options: { diff: boolean }): Promise<number> {
  const { plan, context } = await buildFullPlan(cwd)

  console.log(renderScan(context.scan))

  const simulation = await simulatePlan(plan, {
    repoRoot: context.scan.repoRoot,
    version: CLI_VERSION,
  })

  console.log(renderPlan(plan, simulation, { showDiff: options.diff }))

  if (isBlocked(plan)) {
    console.log(`\n${error('El plan no se puede aplicar: hay conflictos bloqueantes.')}`)
    return 1
  }

  console.log(
    `\n${pc.dim('Nada se ha modificado. Ejecuta `plumbward apply` para aplicar este plan.')}`,
  )
  return 0
}

/**
 * Prepara la rama aislada de trabajo. Devuelve la rama de partida.
 *
 * Qué ramas se aíslan lo decide `requiresIsolation`: todas salvo las ramas de
 * trabajo reconocibles, y siempre con HEAD desacoplado (ADR 0005).
 */
async function prepareBranch(
  repoRoot: string,
  git: Pick<GitState, 'branch' | 'detachedHead' | 'defaultBranch'>,
  createBranch: boolean,
  profile: Profile,
): Promise<string | null> {
  if (!createBranch) return git.branch

  if (!requiresIsolation(git, profile)) {
    log.info(`Se trabajará sobre la rama actual "${git.branch}".`)
    return git.branch
  }

  const origin = git.detachedHead ? 'un HEAD desacoplado' : `la rama "${git.branch}"`
  const exists = await branchExists(repoRoot, GOVERNANCE_BRANCH)
  await execa('git', ['checkout', ...(exists ? [] : ['-b']), GOVERNANCE_BRANCH], {
    cwd: repoRoot,
  })

  // El mensaje dice lo que ha pasado de verdad. Si la rama ya existía, se ha
  // activado tal como estaba, sin actualizarla (pendiente en F0-15).
  log.success(
    exists
      ? `Activada la rama existente "${GOVERNANCE_BRANCH}", tal como estaba. Partías de ${origin}, que no se ha tocado.`
      : `Creada y activada la rama "${GOVERNANCE_BRANCH}" a partir de ${origin}, que no se ha tocado.`,
  )

  return git.branch
}

export interface ApplyOptions {
  readonly yes: boolean
  readonly install: boolean
  readonly branch: boolean
}

/** `apply` — materializa el plan con journal, rollback automático y rama aislada. */
export async function runApply(cwd: string, options: ApplyOptions): Promise<number> {
  const { plan, context } = await buildFullPlan(cwd)
  const { scan } = context

  if (!scan.git.isRepo) {
    console.log(error('Este directorio no es un repositorio git.'))
    console.log(
      pc.dim('  Ejecuta `git init` primero: la herramienta necesita poder revertir los cambios.'),
    )
    return 1
  }

  const simulation = await simulatePlan(plan, {
    repoRoot: scan.repoRoot,
    version: CLI_VERSION,
  })
  console.log(renderPlan(plan, simulation, { showDiff: false }))

  if (isBlocked(plan)) {
    console.log(`\n${error('El plan no se puede aplicar: hay conflictos bloqueantes.')}`)
    return 1
  }

  if (simulation.changes.length === 0 && simulation.sideEffects.length === 0) {
    console.log(`\n${success('El repositorio ya está conforme. No hay nada que aplicar.')}`)
    return 0
  }

  if (scan.git.isDirty) {
    console.log(
      `\n${warn('Tienes cambios sin commitear. Se recomienda hacer commit antes de continuar.')}`,
    )
  }

  if (!options.yes) {
    const answer = await confirm({
      message: `¿Aplicar estos cambios${
        options.install ? ' e instalar las dependencias' : ''
      }?`,
      initialValue: true,
    })
    if (isCancel(answer) || !answer) {
      outro('Cancelado. No se ha modificado nada.')
      return 0
    }
  }

  await prepareBranch(scan.repoRoot, scan.git, options.branch, context.context.profile)

  try {
    const result = await applyPlan(plan, {
      repoRoot: scan.repoRoot,
      version: CLI_VERSION,
      branch: scan.git.branch,
      runCommands: options.install,
      runner,
      onProgress: ({ operation, status, note }) => {
        if (status === 'skipped') return
        const path =
          operation.kind === 'execCommand'
            ? `${operation.cmd} ${operation.args.join(' ')}`
            : 'path' in operation
              ? operation.path
              : operation.kind
        log.step(`${pc.green('✓')} ${path}${note ? pc.dim(` (${note})`) : ''}`)
      },
    })

    console.log(
      `\n${success(
        `${result.applied} operaciones aplicadas, ${result.skipped} omitidas por estar ya al día.`,
      )}`,
    )
    console.log(pc.dim(`  Journal: ${result.journalPath}`))

    console.log(`\n${pc.bold('Siguientes pasos')}`)
    console.log('  1. Lee GOBERNANZA.md: explica al equipo qué se ha instalado.')
    if (!options.install) {
      console.log('  2. Instala las dependencias listadas arriba.')
    }
    console.log(
      `  ${options.install ? '2' : '3'}. Revisa el diff con \`git diff\` y abre una Pull Request.`,
    )
    console.log(
      `  ${options.install ? '3' : '4'}. Si algo no encaja: \`plumbward rollback\` lo deja todo como estaba.`,
    )

    return 0
  } catch (cause) {
    if (cause instanceof ApplyFailedError) {
      console.log(`\n${error(cause.message)}`)
      console.log(
        cause.rolledBack
          ? pc.dim('  Los cambios se han revertido automáticamente: el repositorio está intacto.')
          : pc.red('  ATENCIÓN: no se pudo revertir del todo. Ejecuta `plumbward rollback`.'),
      )
      return 1
    }
    throw cause
  }
}

/** `rollback` — deshace la última ejecución a partir del journal. */
export async function runRollback(cwd: string): Promise<number> {
  const { scan } = await buildContext(cwd)

  try {
    const result = await rollbackLastApply(scan.repoRoot)
    console.log(
      success(
        `Revertidas ${result.operationsReverted} operaciones (${result.restoredFiles} ficheros restaurados).`,
      ),
    )
    console.log(pc.dim('  Comprueba con `git status --porcelain` que el árbol está limpio.'))
    if (scan.git.branch === GOVERNANCE_BRANCH) {
      console.log(
        pc.dim(
          `  Sigues en la rama "${GOVERNANCE_BRANCH}"; vuelve a la tuya con \`git checkout -\`.`,
        ),
      )
    }
    return 0
  } catch (cause) {
    console.log(error(cause instanceof Error ? cause.message : String(cause)))
    return 1
  }
}

/** `doctor` — diagnostica la configuración instalada y propone arreglos. */
export async function runDoctor(cwd: string): Promise<number> {
  const { context } = await buildContext(cwd)
  const registry = buildRegistry()
  const checks = await registry.runHealthChecks(context)

  if (checks.length === 0) {
    console.log(warn('No se ha reconocido ningún stack soportado en este repositorio.'))
    return 1
  }

  console.log(renderHealthChecks(checks))
  return checks.every((check) => check.ok) ? 0 : 1
}
