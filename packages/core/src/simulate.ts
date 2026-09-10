import { ensureBlock as ensureBlockInText, patchJson, patchYaml } from '@plumbward/ast'
import type { AddDependencyOp, ChangePlan, ExecCommandOp, Operation } from './types.js'
import { readFileIfExists, resolveInRepo } from './fs.js'
import { withManagedHeader } from './apply.js'

/** Resultado de la simulación para un fichero concreto. */
export interface SimulatedChange {
  readonly path: string
  /** Contenido actual, o `null` si el fichero no existe todavía. */
  readonly before: string | null
  readonly after: string
  readonly reasons: readonly string[]
}

export interface SimulationResult {
  readonly changes: readonly SimulatedChange[]
  /** Operaciones que no producen cambio (el repo ya está conforme). */
  readonly noOps: readonly Operation[]
  /**
   * Operaciones que no tocan ficheros. El tipo es deliberadamente estrecho: sólo
   * dependencias y comandos pueden acabar aquí, y quien lo consuma necesita
   * poder leer `cmd` y `args` sin comprobaciones redundantes.
   */
  readonly sideEffects: readonly (AddDependencyOp | ExecCommandOp)[]
}

/**
 * Ejecuta el plan EN MEMORIA para poder mostrar el diff exacto antes de tocar
 * el disco.
 *
 * Es la función que sostiene la confianza en la herramienta: reutiliza los
 * mismos parsers que `apply`, así que lo que el usuario ve en `plan` es
 * literalmente lo que va a ocurrir, no una aproximación.
 */
export async function simulatePlan(
  plan: ChangePlan,
  options: { repoRoot: string; version: string },
): Promise<SimulationResult> {
  /** Overlay: ruta -> contenido resultante (o `null` si no existe). */
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
