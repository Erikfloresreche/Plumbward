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
  OutputLanguage,
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

/** Command runner injected by the CLI layer (so the core is not tied to execa). */
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
  /** CLI version, stamped in the headers of the managed files. */
  readonly version: string
  /**
   * Branch that is about to be written on, read **after** switching branches.
   * Passing the starting branch here is the bug that made `rollback` overwrite
   * `Prod` with the snapshots of the isolated branch.
   */
  readonly writtenOnBranch: string | null
  /**
   * Commit HEAD points to when writing, read in the same call as
   * `writtenOnBranch`. It identifies the site; the branch name only labels it
   * (see `Journal.writtenOnCommit`).
   */
  readonly writtenOnCommit: string | null
  /** Branch `apply` was launched from, to be able to say how to go back to it. */
  readonly startedOnBranch: string | null
  /** If `false`, the `execCommand`s are recorded but not run. */
  readonly runCommands: boolean
  readonly runner?: CommandRunner
  readonly onProgress?: (event: ProgressEvent) => void
}

interface ExecutionOutcome {
  readonly snapshots: FileSnapshot[]
  readonly status: 'applied' | 'skipped'
  readonly note?: string
}

/** Error that signals the apply failed and the repository was already reverted. */
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
 * Materialises a `ChangePlan` on the repository.
 *
 * Guarantees:
 *  - Before touching any file, its previous content is saved in the journal.
 *  - The journal is persisted after EVERY operation, so a power cut leaves a
 *    state recoverable with `plumbward rollback`.
 *  - If something fails halfway, it is reverted automatically (the
 *    "operational resilience" requirement of the specification).
 */
export async function applyPlan(
  plan: ChangePlan,
  options: ApplyOptions,
): Promise<ApplyResult> {
  if (isBlocked(plan)) {
    throw new ApplyFailedError(
      'The plan has blocking conflicts. Resolve them before applying.',
      undefined,
      false,
    )
  }

  const journalPath = resolveInRepo(options.repoRoot, JOURNAL_FILE)
  const startedAt = new Date().toISOString()
  const entries: JournalEntry[] = []
  const journal = (): Journal => ({
    version: 3,
    startedAt,
    repoRoot: options.repoRoot,
    writtenOnBranch: options.writtenOnBranch,
    writtenOnCommit: options.writtenOnCommit,
    startedOnBranch: options.startedOnBranch,
    entries: [...entries],
  })

  const operations = [...plan.operations, ...synthesiseInstallCommands(plan.operations)]

  let applied = 0
  let skipped = 0

  for (const [index, operation] of operations.entries()) {
    try {
      const outcome = await executeOperation(operation, options, plan.language)

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

      // Immediate persistence: the journal must survive a cut halfway.
      await writeFileEnsuringDir(journalPath, `${JSON.stringify(journal(), null, 2)}\n`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      let rolledBack = true
      try {
        await revertEntries(entries, options.repoRoot)
        // Nothing is left to revert: the journal is removed to leave the
        // working tree exactly as it was before starting.
        await removeFile(journalPath)
      } catch {
        rolledBack = false
      }
      throw new ApplyFailedError(
        `Failed to apply "${describeOperation(operation)}": ${detail}`,
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
  language: OutputLanguage,
): Promise<ExecutionOutcome> {
  switch (operation.kind) {
    case 'createFile': {
      const absolute = resolveInRepo(options.repoRoot, operation.path)
      const existing = await readFileIfExists(absolute)
      const content = operation.managed
        ? withManagedHeader(operation.path, operation.content, options.version, language)
        : operation.content

      if (existing !== undefined) {
        if (existing === content) {
          return { snapshots: [], status: 'skipped', note: 'already up to date' }
        }
        const policy = operation.onExists ?? 'skip'
        if (policy === 'skip') {
          return { snapshots: [], status: 'skipped', note: 'already exists, left untouched' }
        }
        if (policy === 'conflict') {
          throw new Error(`the file "${operation.path}" already exists and cannot be overwritten`)
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
        throw new Error(`the file "${operation.path}" to patch does not exist`)
      }

      const result = patchJson(
        existing,
        [{ pointer: operation.pointer, value: operation.value, strategy: operation.strategy }],
        operation.path,
      )
      if (!result.changed) {
        return { snapshots: [], status: 'skipped', note: 'already up to date' }
      }

      const snapshot = await snapshotFile(options.repoRoot, operation.path)
      await writeFileEnsuringDir(absolute, result.text)
      return { snapshots: [snapshot], status: 'applied' }
    }

    case 'patchYaml': {
      const absolute = resolveInRepo(options.repoRoot, operation.path)
      const existing = await readFileIfExists(absolute)
      if (existing === undefined) {
        throw new Error(`the file "${operation.path}" to patch does not exist`)
      }

      const result = patchYaml(
        existing,
        [{ pointer: operation.pointer, value: operation.value, strategy: operation.strategy }],
        operation.path,
      )
      if (!result.changed) {
        return { snapshots: [], status: 'skipped', note: 'already up to date' }
      }

      const snapshot = await snapshotFile(options.repoRoot, operation.path)
      await writeFileEnsuringDir(absolute, result.text)
      return { snapshots: [snapshot], status: 'applied' }
    }

    case 'ensureBlock': {
      const absolute = resolveInRepo(options.repoRoot, operation.path)
      const existing = await readFileIfExists(absolute)
      if (existing === undefined && !operation.createIfMissing) {
        return { snapshots: [], status: 'skipped', note: 'the target file does not exist' }
      }

      const result = ensureBlockInText(
        existing ?? '',
        operation.blockId,
        operation.content,
        operation.commentStyle,
        language,
      )
      if (!result.changed) {
        return { snapshots: [], status: 'skipped', note: 'already up to date' }
      }

      const snapshot = await snapshotFile(options.repoRoot, operation.path)
      await writeFileEnsuringDir(absolute, result.text)
      return { snapshots: [snapshot], status: 'applied' }
    }

    case 'addDependency': {
      // It modifies nothing by itself: the plan compiles every dependency into
      // a single install command per manager, which is what runs. That is why
      // it counts as skipped: "applied" then always means "something really
      // changed", and idempotency is observable in the count.
      return { snapshots: [], status: 'skipped', note: 'grouped into the install command' }
    }

    case 'execCommand': {
      if (!options.runCommands) {
        return { snapshots: [], status: 'skipped', note: 'skipped (command execution disabled)' }
      }
      const runner = options.runner
      if (!runner) {
        throw new Error('no command runner was injected')
      }
      const cwd = operation.cwd
        ? resolveInRepo(options.repoRoot, operation.cwd)
        : resolveInRepo(options.repoRoot, '.')

      try {
        await runner(operation.cmd, operation.args, cwd)
      } catch (error) {
        if (operation.optional) {
          const detail = error instanceof Error ? error.message : String(error)
          return { snapshots: [], status: 'skipped', note: `optional, failed: ${detail}` }
        }
        throw error
      }
      return { snapshots: [], status: 'applied' }
    }
  }
}

/** Adds the managed-file header when the format takes comments. */
export function withManagedHeader(
  filePath: string,
  content: string,
  version: string,
  language: OutputLanguage,
): string {
  const style = commentStyleForPath(filePath)
  if (!style) return content
  const header = managedHeader(style, version, shortHash(content), language)
  return `${header}\n\n${content}`
}

/** Captures the previous state of a file, to be able to revert it exactly. */
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

/** Undoes the entries of a journal in reverse order. */
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
 * Compiles the declared dependencies into a single install command per
 * manager. Grouping avoids N slow invocations and keeps the plan readable.
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
      reason: `Installs ${names.length} ${dev ? 'development' : 'production'} dependency(ies).`,
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

/** Short, readable description of an operation, for logs and errors. */
export function describeOperation(operation: Operation): string {
  switch (operation.kind) {
    case 'createFile':
      return `create ${operation.path}`
    case 'patchJson':
      return `patch ${operation.path} at ${operation.pointer}`
    case 'patchYaml':
      return `patch ${operation.path} at ${operation.pointer}`
    case 'ensureBlock':
      return `block "${operation.blockId}" in ${operation.path}`
    case 'addDependency':
      return `dependency ${operation.name} (${operation.manager})`
    case 'execCommand':
      return `run ${operation.cmd} ${operation.args.join(' ')}`
  }
}
