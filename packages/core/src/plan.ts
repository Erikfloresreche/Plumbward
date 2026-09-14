import type { ChangePlan, Conflict, Operation, PlanSummary } from './types.js'

/**
 * Accumulator of operations. Every pack contributes here, and the builder takes
 * care of deduplicating, detecting clashes between packs and computing the
 * summary.
 *
 * No pack builds a `ChangePlan` on its own: that way the order of the
 * operations and the conflict policy live in a single place.
 */
export class PlanBuilder {
  readonly #operations: Operation[] = []
  readonly #conflicts: Conflict[] = []
  readonly #contributors = new Set<string>()
  /** Target key -> fingerprint of the operation, to detect clashes. */
  readonly #targets = new Map<string, { fingerprint: string; contributor: string }>()

  /** Adds operations attributed to a pack. Exact duplicates are ignored. */
  add(contributor: string, operations: readonly Operation[]): this {
    this.#contributors.add(contributor)

    for (const operation of operations) {
      const key = targetKey(operation)
      const fingerprint = JSON.stringify(operation)
      const previous = this.#targets.get(key)

      if (previous) {
        if (previous.fingerprint === fingerprint) continue // exact duplicate
        this.#conflicts.push({
          path: operationPath(operation) ?? key,
          reason: `Los packs "${previous.contributor}" y "${contributor}" quieren configurar lo mismo de forma distinta.`,
          severity: 'warn',
        })
        continue
      }

      this.#targets.set(key, { fingerprint, contributor })
      this.#operations.push(operation)
    }

    return this
  }

  /** Records a conflict detected during the analysis phase. */
  conflict(conflict: Conflict): this {
    this.#conflicts.push(conflict)
    return this
  }

  build(): ChangePlan {
    return {
      version: 1,
      operations: [...this.#operations].sort(compareOperations),
      conflicts: [...this.#conflicts],
      summary: summarise(this.#operations, this.#conflicts),
      contributors: [...this.#contributors].sort(),
    }
  }
}

/** File path the operation affects, if it has one. */
export function operationPath(operation: Operation): string | undefined {
  switch (operation.kind) {
    case 'createFile':
    case 'patchJson':
    case 'patchYaml':
    case 'ensureBlock':
      return operation.path
    default:
      return undefined
  }
}

/** Identity of the target of an operation, to deduplicate. */
function targetKey(operation: Operation): string {
  switch (operation.kind) {
    case 'createFile':
      return `createFile:${operation.path}`
    case 'patchJson':
      return `patchJson:${operation.path}:${operation.pointer}`
    case 'patchYaml':
      return `patchYaml:${operation.path}:${operation.pointer}`
    case 'ensureBlock':
      return `ensureBlock:${operation.path}:${operation.blockId}`
    case 'addDependency':
      return `dep:${operation.manager}:${operation.name}`
    case 'execCommand':
      return `exec:${operation.cmd}:${operation.args.join(' ')}`
  }
}

/**
 * Order of application. It matters: files must exist before they are patched,
 * and dependencies must be declared before running commands that use them.
 */
const KIND_ORDER: Record<Operation['kind'], number> = {
  createFile: 0,
  ensureBlock: 1,
  patchJson: 2,
  patchYaml: 3,
  addDependency: 4,
  execCommand: 5,
}

function compareOperations(a: Operation, b: Operation): number {
  const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
  if (byKind !== 0) return byKind
  return (operationPath(a) ?? '').localeCompare(operationPath(b) ?? '')
}

function summarise(
  operations: readonly Operation[],
  conflicts: readonly Conflict[],
): PlanSummary {
  const modifiedPaths = new Set<string>()
  let filesCreated = 0
  let dependencies = 0
  let commands = 0

  for (const operation of operations) {
    switch (operation.kind) {
      case 'createFile':
        filesCreated += 1
        break
      case 'patchJson':
      case 'patchYaml':
      case 'ensureBlock':
        modifiedPaths.add(operation.path)
        break
      case 'addDependency':
        dependencies += 1
        break
      case 'execCommand':
        commands += 1
        break
    }
  }

  return {
    filesCreated,
    filesModified: modifiedPaths.size,
    dependencies,
    commands,
    conflicts: conflicts.length,
  }
}

/** `true` if the plan has any conflict that prevents applying it. */
export function isBlocked(plan: ChangePlan): boolean {
  return plan.conflicts.some((conflict) => conflict.severity === 'block')
}

/** `true` if there is nothing to do (the repo already complies). */
export function isEmpty(plan: ChangePlan): boolean {
  return plan.operations.length === 0
}
