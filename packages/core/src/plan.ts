import type { ChangePlan, Conflict, Operation, PlanSummary } from './types.js'

/**
 * Acumulador de operaciones. Cada pack contribuye aquí y el builder se encarga
 * de deduplicar, detectar choques entre packs y calcular el resumen.
 *
 * Ningún pack construye un `ChangePlan` por su cuenta: así el orden de las
 * operaciones y la política de conflictos viven en un único sitio.
 */
export class PlanBuilder {
  readonly #operations: Operation[] = []
  readonly #conflicts: Conflict[] = []
  readonly #contributors = new Set<string>()
  /** Clave de destino -> huella de la operación, para detectar choques. */
  readonly #targets = new Map<string, { fingerprint: string; contributor: string }>()

  /** Añade operaciones atribuidas a un pack. Las duplicadas exactas se ignoran. */
  add(contributor: string, operations: readonly Operation[]): this {
    this.#contributors.add(contributor)

    for (const operation of operations) {
      const key = targetKey(operation)
      const fingerprint = JSON.stringify(operation)
      const previous = this.#targets.get(key)

      if (previous) {
        if (previous.fingerprint === fingerprint) continue // duplicado exacto
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

  /** Registra un conflicto detectado durante la fase de análisis. */
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

/** Ruta de fichero afectada por la operación, si la tiene. */
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

/** Identidad del destino de una operación, para deduplicar. */
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
 * Orden de aplicación. Importa: los ficheros deben existir antes de parchearlos
 * y las dependencias deben declararse antes de ejecutar comandos que las usen.
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

/** `true` si el plan tiene algún conflicto que impide aplicarlo. */
export function isBlocked(plan: ChangePlan): boolean {
  return plan.conflicts.some((conflict) => conflict.severity === 'block')
}

/** `true` si no hay nada que hacer (el repo ya está conforme). */
export function isEmpty(plan: ChangePlan): boolean {
  return plan.operations.length === 0
}
