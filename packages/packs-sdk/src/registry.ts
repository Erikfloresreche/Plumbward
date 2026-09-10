import { PlanBuilder } from '@plumbward/core'
import type { ChangePlan } from '@plumbward/core'
import type { DetectionResult, HealthCheck, RepoContext, StackPack } from './contract.js'

export interface SelectedPack {
  readonly pack: StackPack
  readonly detection: DetectionResult
}

/**
 * Registro de packs. Selecciona los aplicables, los ordena por confianza y
 * agrega sus contribuciones en un único `ChangePlan`.
 *
 * Los packs no se conocen entre sí: si dos quieren configurar lo mismo de forma
 * distinta, el `PlanBuilder` lo detecta y lo reporta como conflicto.
 */
export class PackRegistry {
  readonly #packs: readonly StackPack[]

  constructor(packs: readonly StackPack[]) {
    const ids = new Set<string>()
    for (const pack of packs) {
      if (ids.has(pack.id)) {
        throw new Error(`Pack duplicado en el registro: "${pack.id}".`)
      }
      ids.add(pack.id)
    }
    this.#packs = packs
  }

  get packs(): readonly StackPack[] {
    return this.#packs
  }

  /** Packs aplicables al repositorio, de mayor a menor confianza. */
  async select(context: RepoContext): Promise<SelectedPack[]> {
    const results = await Promise.all(
      this.#packs.map(async (pack) => ({ pack, detection: await pack.detect(context) })),
    )

    return results
      .filter((entry) => entry.detection.applies)
      .sort((a, b) => b.detection.confidence - a.detection.confidence)
  }

  /** Construye el plan completo a partir de los packs seleccionados. */
  async buildPlan(context: RepoContext): Promise<ChangePlan> {
    const selected = await this.select(context)
    const builder = new PlanBuilder()

    if (selected.length === 0) {
      builder.conflict({
        path: context.scan.repoRoot,
        reason:
          'No se ha reconocido ningún stack soportado. Ejecuta `plumbward scan` para ver qué se detectó.',
        severity: 'block',
      })
      return builder.build()
    }

    for (const { pack } of selected) {
      const operations = await pack.contribute(context)
      builder.add(pack.id, operations)
    }

    return builder.build()
  }

  /** Ejecuta las comprobaciones de salud de todos los packs aplicables. */
  async runHealthChecks(context: RepoContext): Promise<HealthCheck[]> {
    const selected = await this.select(context)
    const checks = await Promise.all(selected.map(({ pack }) => pack.validate(context)))
    return checks.flat()
  }
}
