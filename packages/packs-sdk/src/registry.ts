import { PlanBuilder } from '@plumbward/core'
import type { ChangePlan } from '@plumbward/core'
import type { DetectionResult, HealthCheck, RepoContext, StackPack } from './contract.js'

export interface SelectedPack {
  readonly pack: StackPack
  readonly detection: DetectionResult
}

/**
 * Pack registry. It selects the applicable packs, sorts them by confidence and
 * gathers their contributions into a single `ChangePlan`.
 *
 * Packs do not know each other: if two want to configure the same thing in
 * different ways, the `PlanBuilder` detects it and reports it as a conflict.
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

  /** Packs applicable to the repository, from highest to lowest confidence. */
  async select(context: RepoContext): Promise<SelectedPack[]> {
    const results = await Promise.all(
      this.#packs.map(async (pack) => ({ pack, detection: await pack.detect(context) })),
    )

    return results
      .filter((entry) => entry.detection.applies)
      .sort((a, b) => b.detection.confidence - a.detection.confidence)
  }

  /** Builds the complete plan from the selected packs. */
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

  /** Runs the health checks of every applicable pack. */
  async runHealthChecks(context: RepoContext): Promise<HealthCheck[]> {
    const selected = await this.select(context)
    const checks = await Promise.all(selected.map(({ pack }) => pack.validate(context)))
    return checks.flat()
  }
}
