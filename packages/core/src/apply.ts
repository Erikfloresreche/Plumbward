import {
  ensureBlock as ensureBlockInText,
  managedHeader,
  patchJson,
  patchYaml,
} from '@plumbward/ast'
import type {
  ApplyResult,
  ChangePlan,
  ExecCommandOp,
  FileSnapshot,
  Journal,
  JournalEntry,
  Operation,
  PackageManager,
} from './types.js'
import { JOURNAL_FILE } from './types.js'
import {
  commentStyleForPath,
  readFileIfExists,
  removeFile,
  resolveInRepo,
  writeFileEnsuringDir,
} from './fs.js'
import { shortHash } from './hash.js'
import { isBlocked } from './plan.js'

/** Ejecutor de comandos inyectado por la capa CLI (para no atar el núcleo a execa). */
export type CommandRunner = (
  cmd: string,
  args: readonly string[],
  cwd: string,
) => Promise<void>

export interface ProgressEvent {
  readonly operation: Operation
  readonly status: 'applied' | 'skipped'
  readonly note?: string
}

export interface ApplyOptions {
  readonly repoRoot: string
  /** Versión de la CLI, sellada en las cabeceras de los ficheros gestionados. */
  readonly version: string
  /**
   * Rama sobre la que se va a escribir, leída **después** de cambiar de rama.
   * Pasar aquí la rama de partida es el fallo que hacía que `rollback`
   * sobrescribiera `Prod` con los snapshots de la rama aislada.
   */
  readonly writtenOnBranch: string | null
  /** Si es `false`, los `execCommand` se registran pero no se ejecutan. */
  readonly runCommands: boolean
  readonly runner?: CommandRunner
  readonly onProgress?: (event: ProgressEvent) => void
}

interface ExecutionOutcome {
  readonly snapshots: FileSnapshot[]
  readonly status: 'applied' | 'skipped'
  readonly note?: string
}

/** Error que indica que el apply falló y el repositorio ya fue revertido. */
export class ApplyFailedError extends Error {
  readonly rolledBack: boolean
  readonly operation: Operation | undefined

  constructor(message: string, operation: Operation | undefined, rolledBack: boolean) {
    super(message)
    this.name = 'ApplyFailedError'
    this.operation = operation
    this.rolledBack = rolledBack
  }
}

/**
 * Materializa un `ChangePlan` sobre el repositorio.
 *
 * Garantías:
 *  - Antes de tocar cualquier fichero se guarda su contenido previo en el journal.
 *  - El journal se persiste tras CADA operación, así que un corte de luz deja un
 *    estado recuperable con `plumbward rollback`.
 *  - Si algo falla a mitad, se revierte automáticamente (requisito de
 *    "resiliencia operativa" de la especificación).
 */
export async function applyPlan(
  plan: ChangePlan,
  options: ApplyOptions,
): Promise<ApplyResult> {
  if (isBlocked(plan)) {
    throw new ApplyFailedError(
      'El plan tiene conflictos bloqueantes. Resuélvelos antes de aplicar.',
      undefined,
      false,
    )
  }

  const journalPath = resolveInRepo(options.repoRoot, JOURNAL_FILE)
  const startedAt = new Date().toISOString()
  const entries: JournalEntry[] = []
  const journal = (): Journal => ({
    version: 2,
    startedAt,
    repoRoot: options.repoRoot,
    writtenOnBranch: options.writtenOnBranch,
    entries: [...entries],
  })

  const operations = [...plan.operations, ...synthesiseInstallCommands(plan.operations)]

  let applied = 0
  let skipped = 0

  for (const [index, operation] of operations.entries()) {
    try {
      const outcome = await executeOperation(operation, options)

      entries.push({
        index,
        operation,
        snapshots: outcome.snapshots,
        appliedAt: new Date().toISOString(),
        status: outcome.status,
        ...(outcome.note === undefined ? {} : { note: outcome.note }),
      })

      if (outcome.status === 'applied') applied += 1
      else skipped += 1

      options.onProgress?.({
        operation,
        status: outcome.status,
        ...(outcome.note === undefined ? {} : { note: outcome.note }),
      })

      // Persistencia inmediata: el journal debe sobrevivir a un corte a mitad.
      await writeFileEnsuringDir(journalPath, `${JSON.stringify(journal(), null, 2)}\n`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      let rolledBack = true
      try {
        await revertEntries(entries, options.repoRoot)
        // Ya no queda nada que revertir: el journal se elimina para dejar el
        // árbol de trabajo exactamente como estaba antes de empezar.
        await removeFile(journalPath)
      } catch {
        rolledBack = false
      }
      throw new ApplyFailedError(
        `Fallo al aplicar "${describeOperation(operation)}": ${detail}`,
        operation,
        rolledBack,
      )
    }
  }

  const finalJournal = journal()
  await writeFileEnsuringDir(journalPath, `${JSON.stringify(finalJournal, null, 2)}\n`)

  return { applied, skipped, journalPath, journal: finalJournal }
}

async function executeOperation(
  operation: Operation,
  options: ApplyOptions,
): Promise<ExecutionOutcome> {
  switch (operation.kind) {
    case 'createFile': {
      const absolute = resolveInRepo(options.repoRoot, operation.path)
      const existing = await readFileIfExists(absolute)
      const content = operation.managed
        ? withManagedHeader(operation.path, operation.content, options.version)
        : operation.content

      if (existing !== undefined) {
        if (existing === content) {
          return { snapshots: [], status: 'skipped', note: 'ya está al día' }
        }
        const policy = operation.onExists ?? 'skip'
        if (policy === 'skip') {
          return { snapshots: [], status: 'skipped', note: 'ya existe, no se toca' }
        }
        if (policy === 'conflict') {
          throw new Error(`el fichero "${operation.path}" ya existe y no se puede sobrescribir`)
        }
      }

      const snapshot = await snapshotFile(options.repoRoot, operation.path)
      await writeFileEnsuringDir(absolute, content)
      return { snapshots: [snapshot], status: 'applied' }
    }

    case 'patchJson': {
      const absolute = resolveInRepo(options.repoRoot, operation.path)
      const existing = await readFileIfExists(absolute)
      if (existing === undefined) {
        throw new Error(`no existe el fichero "${operation.path}" que se quería parchear`)
      }

      const result = patchJson(
        existing,
        [{ pointer: operation.pointer, value: operation.value, strategy: operation.strategy }],
        operation.path,
      )
      if (!result.changed) {
        return { snapshots: [], status: 'skipped', note: 'ya está al día' }
      }

      const snapshot = await snapshotFile(options.repoRoot, operation.path)
      await writeFileEnsuringDir(absolute, result.text)
      return { snapshots: [snapshot], status: 'applied' }
    }

    case 'patchYaml': {
      const absolute = resolveInRepo(options.repoRoot, operation.path)
      const existing = await readFileIfExists(absolute)
      if (existing === undefined) {
        throw new Error(`no existe el fichero "${operation.path}" que se quería parchear`)
      }

      const result = patchYaml(
        existing,
        [{ pointer: operation.pointer, value: operation.value, strategy: operation.strategy }],
        operation.path,
      )
      if (!result.changed) {
        return { snapshots: [], status: 'skipped', note: 'ya está al día' }
      }

      const snapshot = await snapshotFile(options.repoRoot, operation.path)
      await writeFileEnsuringDir(absolute, result.text)
      return { snapshots: [snapshot], status: 'applied' }
    }

    case 'ensureBlock': {
      const absolute = resolveInRepo(options.repoRoot, operation.path)
      const existing = await readFileIfExists(absolute)
      if (existing === undefined && !operation.createIfMissing) {
        return { snapshots: [], status: 'skipped', note: 'el fichero destino no existe' }
      }

      const result = ensureBlockInText(
        existing ?? '',
        operation.blockId,
        operation.content,
        operation.commentStyle,
      )
      if (!result.changed) {
        return { snapshots: [], status: 'skipped', note: 'ya está al día' }
      }

      const snapshot = await snapshotFile(options.repoRoot, operation.path)
      await writeFileEnsuringDir(absolute, result.text)
      return { snapshots: [snapshot], status: 'applied' }
    }

    case 'addDependency': {
      // No modifica nada por sí misma: el plan compila todas las dependencias en
      // un único comando de instalación por gestor, que es lo que se ejecuta.
      // Por eso se contabiliza como omitida: así "aplicadas" significa siempre
      // "algo cambió de verdad" y la idempotencia es observable en el recuento.
      return { snapshots: [], status: 'skipped', note: 'agrupada en el comando de instalación' }
    }

    case 'execCommand': {
      if (!options.runCommands) {
        return { snapshots: [], status: 'skipped', note: 'omitido (ejecución de comandos desactivada)' }
      }
      const runner = options.runner
      if (!runner) {
        throw new Error('no se ha inyectado un ejecutor de comandos')
      }
      const cwd = operation.cwd
        ? resolveInRepo(options.repoRoot, operation.cwd)
        : resolveInRepo(options.repoRoot, '.')

      try {
        await runner(operation.cmd, operation.args, cwd)
      } catch (error) {
        if (operation.optional) {
          const detail = error instanceof Error ? error.message : String(error)
          return { snapshots: [], status: 'skipped', note: `opcional, falló: ${detail}` }
        }
        throw error
      }
      return { snapshots: [], status: 'applied' }
    }
  }
}

/** Añade la cabecera de fichero gestionado cuando el formato admite comentarios. */
export function withManagedHeader(
  filePath: string,
  content: string,
  version: string,
): string {
  const style = commentStyleForPath(filePath)
  if (!style) return content
  const header = managedHeader(style, version, shortHash(content))
  return `${header}\n\n${content}`
}

/** Captura el estado previo de un fichero para poder revertirlo con exactitud. */
async function snapshotFile(repoRoot: string, relativePath: string): Promise<FileSnapshot> {
  const absolute = resolveInRepo(repoRoot, relativePath)
  const existing = await readFileIfExists(absolute)
  if (existing === undefined) {
    return { path: relativePath, existed: false }
  }
  return {
    path: relativePath,
    existed: true,
    contentBase64: Buffer.from(existing, 'utf8').toString('base64'),
  }
}

/** Deshace las entradas de un journal en orden inverso. */
export async function revertEntries(
  entries: readonly JournalEntry[],
  repoRoot: string,
): Promise<number> {
  let reverted = 0

  for (const entry of [...entries].reverse()) {
    for (const snapshot of [...entry.snapshots].reverse()) {
      const absolute = resolveInRepo(repoRoot, snapshot.path)
      if (snapshot.existed && snapshot.contentBase64 !== undefined) {
        await writeFileEnsuringDir(
          absolute,
          Buffer.from(snapshot.contentBase64, 'base64').toString('utf8'),
        )
      } else {
        await removeFile(absolute)
      }
      reverted += 1
    }
  }

  return reverted
}

/**
 * Compila las dependencias declaradas en un único comando de instalación por
 * gestor. Agrupar evita N invocaciones lentas y deja el plan legible.
 */
export function synthesiseInstallCommands(
  operations: readonly Operation[],
): ExecCommandOp[] {
  const groups = new Map<string, { manager: PackageManager; dev: boolean; names: string[] }>()

  for (const operation of operations) {
    if (operation.kind !== 'addDependency') continue
    const key = `${operation.manager}:${operation.dev}`
    const spec = operation.version ? `${operation.name}@${operation.version}` : operation.name
    const group = groups.get(key)
    if (group) group.names.push(spec)
    else groups.set(key, { manager: operation.manager, dev: operation.dev, names: [spec] })
  }

  const commands: ExecCommandOp[] = []
  for (const { manager, dev, names } of groups.values()) {
    const invocation = installInvocation(manager, dev, names)
    if (!invocation) continue
    commands.push({
      kind: 'execCommand',
      cmd: invocation.cmd,
      args: invocation.args,
      reason: `Instala ${names.length} dependencia(s) ${dev ? 'de desarrollo' : 'de producción'}.`,
    })
  }

  return commands
}

function installInvocation(
  manager: PackageManager,
  dev: boolean,
  names: readonly string[],
): { cmd: string; args: string[] } | undefined {
  switch (manager) {
    case 'npm':
      return { cmd: 'npm', args: ['install', dev ? '--save-dev' : '--save', ...names] }
    case 'pnpm':
      return { cmd: 'pnpm', args: ['add', ...(dev ? ['-D'] : []), ...names] }
    case 'yarn':
      return { cmd: 'yarn', args: ['add', ...(dev ? ['-D'] : []), ...names] }
    case 'bun':
      return { cmd: 'bun', args: ['add', ...(dev ? ['-d'] : []), ...names] }
    case 'composer':
      return { cmd: 'composer', args: ['require', ...(dev ? ['--dev'] : []), ...names] }
    case 'pip':
      return { cmd: 'pip', args: ['install', ...names] }
    case 'poetry':
      return { cmd: 'poetry', args: ['add', ...(dev ? ['--group', 'dev'] : []), ...names] }
    case 'uv':
      return { cmd: 'uv', args: ['add', ...(dev ? ['--dev'] : []), ...names] }
    case 'go':
      return { cmd: 'go', args: ['get', ...names] }
  }
}

/** Descripción corta y legible de una operación, para logs y errores. */
export function describeOperation(operation: Operation): string {
  switch (operation.kind) {
    case 'createFile':
      return `crear ${operation.path}`
    case 'patchJson':
      return `parchear ${operation.path} en ${operation.pointer}`
    case 'patchYaml':
      return `parchear ${operation.path} en ${operation.pointer}`
    case 'ensureBlock':
      return `bloque "${operation.blockId}" en ${operation.path}`
    case 'addDependency':
      return `dependencia ${operation.name} (${operation.manager})`
    case 'execCommand':
      return `ejecutar ${operation.cmd} ${operation.args.join(' ')}`
  }
}
