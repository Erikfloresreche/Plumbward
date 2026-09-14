import { ensureBlock as ensureBlockInText, patchJson, patchYaml } from '@plumbward/ast'
import type { AddDependencyOp, ChangePlan, ExecCommandOp, Operation } from './types.js'
import { readFileIfExists, resolveInRepo } from './fs.js'
import { withManagedHeader } from './apply.js'

/** Result of the simulation for one file. */
export interface SimulatedChange {
  readonly path: string
  /** Current content, or `null` if the file does not exist yet. */
  readonly before: string | null
  readonly after: string
  readonly reasons: readonly string[]
}

export interface SimulationResult {
  readonly changes: readonly SimulatedChange[]
  /** Operations that produce no change (the repo already complies). */
  readonly noOps: readonly Operation[]
  /**
   * Operations that do not touch files. The type is deliberately narrow: only
   * dependencies and commands can end up here, and whoever consumes it needs
   * to read `cmd` and `args` without redundant checks.
   */
  readonly sideEffects: readonly (AddDependencyOp | ExecCommandOp)[]
}

/**
 * Runs the plan IN MEMORY to show the exact diff before touching the disk.
 *
 * It is the function that holds up the trust in the tool: it reuses the same
 * parsers as `apply`, so what the user sees in `plan` is literally what is
 * going to happen, not an approximation.
 */
export async function simulatePlan(
  plan: ChangePlan,
  options: { repoRoot: string; version: string },
): Promise<SimulationResult> {
  /** Overlay: path -> resulting content (or `null` if it does not exist). */
  const overlay = new Map<string, string | null>()
  const original = new Map<string, string | null>()
  const reasons = new Map<string, string[]>()
  const noOps: Operation[] = []
  const sideEffects: (AddDependencyOp | ExecCommandOp)[] = []

  const load = async (path: string): Promise<string | null> => {
    if (overlay.has(path)) return overlay.get(path) ?? null
    const content = (await readFileIfExists(resolveInRepo(options.repoRoot, path))) ?? null
    overlay.set(path, content)
    original.set(path, content)
    return content
  }

  const record = (path: string, reason: string): void => {
    const list = reasons.get(path)
    if (list) list.push(reason)
    else reasons.set(path, [reason])
  }

  for (const operation of plan.operations) {
    switch (operation.kind) {
      case 'createFile': {
        const current = await load(operation.path)
        const content = operation.managed
          ? withManagedHeader(operation.path, operation.content, options.version)
          : operation.content

        if (current !== null && (operation.onExists ?? 'skip') === 'skip') {
          noOps.push(operation)
          break
        }
        if (current === content) {
          noOps.push(operation)
          break
        }
        overlay.set(operation.path, content)
        record(operation.path, operation.reason)
        break
      }

      case 'patchJson': {
        const current = await load(operation.path)
        if (current === null) {
          noOps.push(operation)
          break
        }
        const result = patchJson(
          current,
          [{ pointer: operation.pointer, value: operation.value, strategy: operation.strategy }],
          operation.path,
        )
        if (!result.changed) {
          noOps.push(operation)
          break
        }
        overlay.set(operation.path, result.text)
        record(operation.path, operation.reason)
        break
      }

      case 'patchYaml': {
        const current = await load(operation.path)
        if (current === null) {
          noOps.push(operation)
          break
        }
        const result = patchYaml(
          current,
          [{ pointer: operation.pointer, value: operation.value, strategy: operation.strategy }],
          operation.path,
        )
        if (!result.changed) {
          noOps.push(operation)
          break
        }
        overlay.set(operation.path, result.text)
        record(operation.path, operation.reason)
        break
      }

      case 'ensureBlock': {
        const current = await load(operation.path)
        if (current === null && !operation.createIfMissing) {
          noOps.push(operation)
          break
        }
        const result = ensureBlockInText(
          current ?? '',
          operation.blockId,
          operation.content,
          operation.commentStyle,
        )
        if (!result.changed) {
          noOps.push(operation)
          break
        }
        overlay.set(operation.path, result.text)
        record(operation.path, operation.reason)
        break
      }

      case 'addDependency':
      case 'execCommand':
        sideEffects.push(operation)
        break
    }
  }

  const changes: SimulatedChange[] = []
  for (const [path, after] of overlay) {
    if (after === null) continue
    const before = original.get(path) ?? null
    if (before === after) continue
    changes.push({ path, before, after, reasons: reasons.get(path) ?? [] })
  }

  changes.sort((a, b) => a.path.localeCompare(b.path))

  return { changes, noOps, sideEffects }
}
